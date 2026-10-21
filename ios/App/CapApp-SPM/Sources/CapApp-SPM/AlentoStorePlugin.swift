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
        CAPPluginMethod(name: "unfinished", returnType: CAPPluginReturnPromise),
    ]

    @MainActor private var pending: [UInt64: Transaction] = [:]
    private var updatesTask: Task<Void, Never>?

    override public func load() {
        // Renovaciones, reembolsos y compras pendientes (p. ej. aprobadas por un familiar).
        updatesTask = Task { @MainActor [weak self] in
            for await result in Transaction.updates {
                guard case .verified(let tx) = result else { continue }
                await self?.remember(tx)
                self?.notifyListeners("transactionUpdate", data: [
                    "signedTransaction": result.jwsRepresentation,
                    "transactionId": String(tx.id),
                ], retainUntilConsumed: true)
            }
        }
    }

    deinit { updatesTask?.cancel() }

    @MainActor private func remember(_ tx: Transaction) async { pending[tx.id] = tx }

    @objc func getProducts(_ call: CAPPluginCall) {
        let ids = call.getArray("productIds", String.self) ?? []
        Task { @MainActor in
            do {
                let products = try await Product.products(for: ids)
                call.resolve(["products": products.compactMap { p -> [String: Any]? in
                    guard p.type == .autoRenewable, let period = p.subscription?.subscriptionPeriod else { return nil }
                    let unit: String
                    switch period.unit {
                    case .day: unit = "day"
                    case .week: unit = "week"
                    case .month: unit = "month"
                    case .year: unit = "year"
                    @unknown default: return nil
                    }
                    return ["productId": p.id, "displayName": p.displayName, "displayPrice": p.displayPrice,
                     "periodUnit": unit, "periodValue": period.value]
                }])
            } catch { call.reject("No se pudieron cargar los productos.", nil, error) }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("productId"),
              let raw = call.getString("appAccountToken"),
              let token = UUID(uuidString: raw) else { return call.reject("Identifícate para comprar.", "AUTH_REQUIRED") }
        Task { @MainActor in
            do {
                guard let product = try await Product.products(for: [id]).first else {
                    return call.reject("Producto no disponible en App Store.", "PRODUCT_NOT_FOUND")
                }
                switch try await product.purchase(options: [.appAccountToken(token)]) {
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
        Task { @MainActor in
            if let tx = pending.removeValue(forKey: id) { await tx.finish() }
            call.resolve()
        }
    }

    @objc func unfinished(_ call: CAPPluginCall) {
        Task { @MainActor in
            var items: [[String: String]] = []
            for await result in Transaction.unfinished {
                guard case .verified(let tx) = result else { continue }
                pending[tx.id] = tx
                items.append(["signedTransaction": result.jwsRepresentation, "transactionId": String(tx.id)])
            }
            call.resolve(["transactions": items])
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task { @MainActor in
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
