import UIKit
import Capacitor

class BlippViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeAudioPlugin())
        bridge?.registerPluginInstance(NativeImaAdsPlugin())
    }
}
