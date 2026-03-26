import Foundation
import AVFoundation
import Capacitor
import GoogleInteractiveMediaAds

@objc(NativeImaAdsPlugin)
public class NativeImaAdsPlugin: CAPPlugin, CAPBridgedPlugin, IMAAdsLoaderDelegate, IMAAdsManagerDelegate {
    public let identifier = "NativeImaAdsPlugin"
    public let jsName = "NativeImaAds"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestAds", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pauseAd", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resumeAd", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "destroy", returnType: CAPPluginReturnPromise),
    ]

    private var adsLoader: IMAAdsLoader?
    private var adsManager: IMAAdsManager?
    private var adDisplayContainer: IMAAdDisplayContainer?
    private var containerView: UIView?
    private var adCompleted = false

    // MARK: - Plugin Methods

    @objc func requestAds(_ call: CAPPluginCall) {
        guard let vastUrl = call.getString("vastUrl") else {
            call.reject("Missing vastUrl parameter")
            return
        }

        DispatchQueue.main.async { [weak self] in
            self?.loadAds(vastUrl: vastUrl)
            call.resolve()
        }
    }

    @objc func pauseAd(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.adsManager?.pause()
            call.resolve()
        }
    }

    @objc func resumeAd(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.adsManager?.resume()
            call.resolve()
        }
    }

    @objc func destroy(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.cleanup()
            call.resolve()
        }
    }

    // MARK: - Ad Loading

    private func loadAds(vastUrl: String) {
        cleanup()
        adCompleted = false

        // IMA requires a non-nil container view even for audio-only ads.
        // Create a 1x1 hidden view attached to the bridge's root view.
        guard let rootView = self.bridge?.viewController?.view else {
            notifyListeners("adError", data: ["message": "No root view available"])
            notifyListeners("adCompleted", data: [:])
            return
        }

        let view = UIView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
        view.isHidden = true
        rootView.addSubview(view)
        containerView = view

        adDisplayContainer = IMAAdDisplayContainer(adContainer: view, viewController: self.bridge?.viewController)

        let settings = IMASettings()
        adsLoader = IMAAdsLoader(settings: settings)
        adsLoader?.delegate = self

        let request = IMAAdsRequest(
            adTagUrl: vastUrl,
            adDisplayContainer: adDisplayContainer!,
            contentPlayhead: nil,
            userContext: nil
        )
        adsLoader?.requestAds(with: request)
    }

    // MARK: - IMAAdsLoaderDelegate

    public func adsLoader(_ loader: IMAAdsLoader, adsLoadedWith adsLoadedData: IMAAdsLoadedData) {
        adsManager = adsLoadedData.adsManager
        adsManager?.delegate = self
        adsManager?.initialize(with: nil)
    }

    public func adsLoader(_ loader: IMAAdsLoader, failedWith adErrorData: IMAAdLoadingErrorData) {
        let message = adErrorData.adError?.message ?? "Ad loading failed"
        CAPLog.print("NativeImaAds: Ad load error: \(message)")
        notifyListeners("adError", data: ["message": message])
        fireAdCompleted()
    }

    // MARK: - IMAAdsManagerDelegate

    public func adsManager(_ adsManager: IMAAdsManager, didReceive event: IMAAdEvent) {
        switch event.type {
        case .LOADED:
            adsManager.start()

        case .STARTED:
            let duration = event.ad?.duration ?? 0
            notifyListeners("adStarted", data: ["duration": duration])

        case .AD_PROGRESS:
            if let ad = event.ad {
                // adData contains progress info; compute from ad properties
                let duration = ad.duration
                let currentTime = duration - (event.adData?["adBreakRemainingTime"] as? Double ?? duration)
                let progress = duration > 0 ? currentTime / duration : 0
                notifyListeners("adProgress", data: [
                    "currentTime": currentTime,
                    "duration": duration,
                    "progress": progress,
                ])
            }

        case .COMPLETE:
            fireAdCompleted()

        case .ALL_ADS_COMPLETED:
            fireAdCompleted()

        default:
            break
        }
    }

    public func adsManager(_ adsManager: IMAAdsManager, didReceive error: IMAAdError) {
        let message = error.message ?? "Unknown ad error"
        CAPLog.print("NativeImaAds: Ad error: \(message)")
        notifyListeners("adError", data: ["message": message])
        fireAdCompleted()
    }

    public func adsManagerDidRequestContentPause(_ adsManager: IMAAdsManager) {
        // No-op for audio-only ads — no content player to pause
    }

    public func adsManagerDidRequestContentResume(_ adsManager: IMAAdsManager) {
        // No-op for audio-only ads — no content player to resume
    }

    // MARK: - Helpers

    private func fireAdCompleted() {
        guard !adCompleted else { return }
        adCompleted = true
        notifyListeners("adCompleted", data: [:])
        cleanup()
    }

    private func cleanup() {
        adsManager?.destroy()
        adsManager = nil
        adsLoader = nil
        adDisplayContainer = nil
        containerView?.removeFromSuperview()
        containerView = nil
    }

    deinit {
        cleanup()
    }
}
