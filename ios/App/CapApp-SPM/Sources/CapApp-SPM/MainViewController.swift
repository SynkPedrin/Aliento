import UIKit
import Capacitor

/// Controlador principal: registra el plugin local de StoreKit 2.
@objc(MainViewController)
public class MainViewController: CAPBridgeViewController {
    override public func capacitorDidLoad() {
        bridge?.registerPluginInstance(AlentoStorePlugin())
    }
}
