import Foundation
import Capacitor
import StoreKit

/// Puente StoreKit 2 para la web de Alento (compras dentro de la app, regla 3.1.1 de App Review).
/// La app NUNCA concede acceso por su cuenta: devuelve el JWS firmado por Apple y el servidor
/// (`POST /api/store/transactions`) lo verifica antes de activar el programa.
@objc(AlentoStorePlugin)
public class AlentoStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AlentoStorePlugin"
    public let jsName = "AlentoStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
    ]

    private var pending: [UInt64: Transaction] = [:]
    private var updatesTask: Task<Void, Never>?

    override public func load() {
        // Renovaciones, reembolsos y compras pendientes (p. ej. aprobadas por un familiar).
        updatesTask = Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard case .verified(let tx) = result else { continue }
                await self?.remember(tx)
                self?.notifyListeners("transactionUpdate", data: [
                    "signedTransaction": result.jwsRepresentation,
                    "transactionId": String(tx.id),
                ])
            }
        }
    }

    deinit { updatesTask?.cancel() }

    private func remember(_ tx: Transaction) async { pending[tx.id] = tx }

    @objc func getProducts(_ call: CAPPluginCall) {
        let ids = call.getArray("productIds", String.self) ?? []
        Task {
            do {
                let products = try await Product.products(for: ids)
                call.resolve(["products": products.map { p in
                    ["productId": p.id, "displayName": p.displayName, "displayPrice": p.displayPrice,
                     "price": NSDecimalNumber(decimal: p.price).doubleValue, "currency": p.priceFormatStyle.currencyCode]
                }])
            } catch { call.reject("No se pudieron cargar los productos.", nil, error) }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("productId") else { return call.reject("Falta productId.") }
        Task {
            do {
                guard let product = try await Product.products(for: [id]).first else {
                    return call.reject("Producto no disponible en App Store.", "PRODUCT_NOT_FOUND")
                }
                switch try await product.purchase() {
                case .success(let verification):
                    guard case .verified(let tx) = verification else {
                        return call.reject("Apple no pudo verificar la compra.", "UNVERIFIED")
                    }
                    pending[tx.id] = tx
                    call.resolve(["status": "success", "signedTransaction": verification.jwsRepresentation, "transactionId": String(tx.id)])
                case .pending:
                    call.resolve(["status": "pending"])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                @unknown default:
                    call.reject("Resultado de compra desconocido.")
                }
            } catch { call.reject("La compra no se pudo completar.", nil, error) }
        }
    }

    /// Se llama después de que el servidor confirmó el acceso.
    @objc func finish(_ call: CAPPluginCall) {
        guard let raw = call.getString("transactionId"), let id = UInt64(raw) else { return call.reject("Falta transactionId.") }
        Task {
            if let tx = pending.removeValue(forKey: id) { await tx.finish() }
            call.resolve()
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                var items: [[String: String]] = []
                for await result in Transaction.currentEntitlements {
                    guard case .verified(let tx) = result else { continue }
                    pending[tx.id] = tx
                    items.append(["signedTransaction": result.jwsRepresentation, "transactionId": String(tx.id)])
                }
                call.resolve(["transactions": items])
            } catch { call.reject("No se pudieron restaurar las compras.", nil, error) }
        }
    }
}
