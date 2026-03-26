import Foundation
import AVFoundation
import Capacitor
import MediaPlayer

@objc(NativeAudioPlugin)
public class NativeAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeAudioPlugin"
    public let jsName = "NativeAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setRate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCurrentTime", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDuration", returnType: CAPPluginReturnPromise),
    ]

    private var player: AVPlayer?
    private var playerItem: AVPlayerItem?
    private var timeObserver: Any?
    private var isPlaying = false
    private var currentRate: Float = 1.0

    public override func load() {
        configureAudioSession()
        setupRemoteCommandCenter()
        setupInterruptionHandling()
    }

    // MARK: - Audio Session

    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default)
            try session.setActive(true)
        } catch {
            CAPLog.print("NativeAudio: Failed to configure audio session: \(error)")
        }
    }

    // MARK: - Plugin Methods

    @objc func play(_ call: CAPPluginCall) {
        guard let url = call.getString("url") else {
            call.reject("Missing url parameter")
            return
        }

        guard let audioUrl = URL(string: url) else {
            call.reject("Invalid URL")
            return
        }

        let token = call.getString("token")
        let rate = call.getFloat("rate") ?? currentRate

        DispatchQueue.main.async { [weak self] in
            self?.startPlayback(url: audioUrl, token: token, rate: rate, call: call)
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.player?.pause()
            self?.isPlaying = false
            self?.updateNowPlayingPlaybackState()
            call.resolve()
        }
    }

    @objc func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.player?.rate = self.currentRate
            self.isPlaying = true
            self.updateNowPlayingPlaybackState()
            call.resolve()
        }
    }

    @objc func seek(_ call: CAPPluginCall) {
        guard let time = call.getDouble("time") else {
            call.reject("Missing time parameter")
            return
        }

        DispatchQueue.main.async { [weak self] in
            let cmTime = CMTime(seconds: time, preferredTimescale: 600)
            self?.player?.seek(to: cmTime, toleranceBefore: .zero, toleranceAfter: .zero) { _ in
                self?.updateNowPlayingElapsedTime()
                call.resolve()
            }
        }
    }

    @objc func setRate(_ call: CAPPluginCall) {
        guard let rate = call.getFloat("rate") else {
            call.reject("Missing rate parameter")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.currentRate = rate
            if self.isPlaying {
                self.player?.rate = rate
            }
            self.updateNowPlayingElapsedTime()
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.cleanup()
            call.resolve()
        }
    }

    @objc func getCurrentTime(_ call: CAPPluginCall) {
        let time = player?.currentTime().seconds ?? 0
        call.resolve(["time": time.isNaN ? 0 : time])
    }

    @objc func getDuration(_ call: CAPPluginCall) {
        let duration = playerItem?.duration.seconds ?? 0
        call.resolve(["duration": duration.isNaN ? 0 : duration])
    }

    // MARK: - Playback

    private func startPlayback(url: URL, token: String?, rate: Float, call: CAPPluginCall) {
        cleanup()
        currentRate = rate

        // Create asset with auth headers if needed
        let asset: AVURLAsset
        if let token = token {
            let headers = ["Authorization": "Bearer \(token)"]
            asset = AVURLAsset(url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": headers])
        } else {
            asset = AVURLAsset(url: url)
        }

        playerItem = AVPlayerItem(asset: asset)
        player = AVPlayer(playerItem: playerItem)
        player?.rate = rate

        // Observe when playback starts
        playerItem?.addObserver(self, forKeyPath: "status", options: [.new], context: nil)

        // Observe when playback ends
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(playerDidFinishPlaying),
            name: .AVPlayerItemDidPlayToEndOfTime,
            object: playerItem
        )

        // Periodic time updates (every 0.5s)
        timeObserver = player?.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.5, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            guard let self = self else { return }
            let currentTime = time.seconds
            let duration = self.playerItem?.duration.seconds ?? 0
            self.notifyListeners("timeUpdate", data: [
                "currentTime": currentTime.isNaN ? 0 : currentTime,
                "duration": duration.isNaN ? 0 : duration,
            ])
        }

        isPlaying = true
        call.resolve()
    }

    public override func observeValue(
        forKeyPath keyPath: String?,
        of object: Any?,
        change: [NSKeyValueChangeKey: Any]?,
        context: UnsafeMutableRawPointer?
    ) {
        if keyPath == "status", let item = object as? AVPlayerItem {
            switch item.status {
            case .readyToPlay:
                let duration = item.duration.seconds
                notifyListeners("loaded", data: [
                    "duration": duration.isNaN ? 0 : duration,
                ])
                updateNowPlayingInfo()
            case .failed:
                notifyListeners("error", data: [
                    "message": item.error?.localizedDescription ?? "Unknown error",
                ])
            default:
                break
            }
        }
    }

    @objc private func playerDidFinishPlaying() {
        isPlaying = false
        notifyListeners("ended", data: [:])
    }

    // MARK: - Now Playing Info (Lock Screen)

    private func updateNowPlayingInfo() {
        // Basic info — the JS side will call setNowPlaying with metadata
        updateNowPlayingElapsedTime()
    }

    private func updateNowPlayingElapsedTime() {
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = player?.currentTime().seconds ?? 0
        info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? currentRate : 0
        info[MPMediaItemPropertyPlaybackDuration] = playerItem?.duration.seconds ?? 0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func updateNowPlayingPlaybackState() {
        updateNowPlayingElapsedTime()
    }

    // MARK: - Remote Command Center (Lock Screen Controls)

    private func setupRemoteCommandCenter() {
        let center = MPRemoteCommandCenter.shared()

        center.playCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            self.player?.rate = self.currentRate
            self.isPlaying = true
            self.updateNowPlayingPlaybackState()
            self.notifyListeners("remotePlay", data: [:])
            return .success
        }

        center.pauseCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            self.player?.pause()
            self.isPlaying = false
            self.updateNowPlayingPlaybackState()
            self.notifyListeners("remotePause", data: [:])
            return .success
        }

        center.skipBackwardCommand.preferredIntervals = [15]
        center.skipBackwardCommand.addTarget { [weak self] _ in
            guard let self = self, let player = self.player else { return .commandFailed }
            let newTime = max(0, player.currentTime().seconds - 15)
            player.seek(to: CMTime(seconds: newTime, preferredTimescale: 600))
            self.updateNowPlayingElapsedTime()
            self.notifyListeners("remoteSeekBackward", data: ["time": newTime])
            return .success
        }

        center.skipForwardCommand.preferredIntervals = [30]
        center.skipForwardCommand.addTarget { [weak self] _ in
            guard let self = self, let player = self.player else { return .commandFailed }
            let duration = self.playerItem?.duration.seconds ?? 0
            let newTime = min(duration, player.currentTime().seconds + 30)
            player.seek(to: CMTime(seconds: newTime, preferredTimescale: 600))
            self.updateNowPlayingElapsedTime()
            self.notifyListeners("remoteSeekForward", data: ["time": newTime])
            return .success
        }
    }

    // MARK: - Audio Interruption Handling

    private func setupInterruptionHandling() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption),
            name: AVAudioSession.interruptionNotification,
            object: nil
        )
    }

    @objc private func handleInterruption(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
            return
        }

        switch type {
        case .began:
            isPlaying = false
            notifyListeners("interrupted", data: ["reason": "began"])
        case .ended:
            if let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
                let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
                if options.contains(.shouldResume) {
                    player?.rate = currentRate
                    isPlaying = true
                    notifyListeners("interrupted", data: ["reason": "ended-resume"])
                }
            }
        @unknown default:
            break
        }
    }

    // MARK: - Cleanup

    private func cleanup() {
        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
            timeObserver = nil
        }

        playerItem?.removeObserver(self, forKeyPath: "status")

        NotificationCenter.default.removeObserver(
            self,
            name: .AVPlayerItemDidPlayToEndOfTime,
            object: playerItem
        )

        player?.pause()
        player = nil
        playerItem = nil
        isPlaying = false

        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    deinit {
        cleanup()
        NotificationCenter.default.removeObserver(self)
    }
}
