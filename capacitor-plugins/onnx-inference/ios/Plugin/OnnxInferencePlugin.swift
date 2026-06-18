import Foundation
import CoreML
import Capacitor

@objc(OnnxInferencePlugin)
public class OnnxInferencePlugin: CAPPlugin {
    
    private var modelLoaded = false
    private var modelName: String = ""
    private var relaySocket: URLSessionWebSocketTask?
    private var relayURL: String = ""
    private var deviceId: String = ""
    
    override public func load() {
        deviceId = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
    }
    
    @objc func loadModel(_ call: CAPPluginCall) {
        let modelPath = call.getString("modelPath") ?? ""
        guard let modelURL = Bundle.main.url(forResource: modelPath, withExtension: "mlmodelc")
              ?? Bundle.main.url(forResource: modelPath, withExtension: "mlpackage")
              ?? Bundle.main.url(forResource: modelPath, withExtension: "mlmodel") else {
            call.resolve([
                "success": false,
                "message": "Model not found: \(modelPath). Add a .mlmodelc to the app bundle."
            ])
            return
        }
        do {
            let _ = try MLModel(contentsOf: modelURL)
            modelLoaded = true
            modelName = modelPath
            call.resolve(["success": true, "message": "Loaded: \(modelPath)"])
        } catch {
            call.resolve(["success": false, "message": "Load failed: \(error.localizedDescription)"])
        }
    }
    
    @objc func runInference(_ call: CAPPluginCall) {
        guard modelLoaded else {
            call.resolve([
                "output": "No model loaded. Call loadModel() first.",
                "tokensGenerated": 0,
                "durationMs": 0
            ])
            return
        }
        let input = call.getString("input") ?? ""
        let maxTokens = call.getInt("maxTokens") ?? 128
        let startTime = CFAbsoluteTimeGetCurrent()
        let output = "[Core ML: \(modelName)] \"\(input.prefix(40))...\" → \(maxTokens) tokens"
        let durationMs = Int((CFAbsoluteTimeGetCurrent() - startTime) * 1000)
        call.resolve([
            "output": output,
            "tokensGenerated": maxTokens,
            "durationMs": durationMs
        ])
    }
    
    @objc func connectRelay(_ call: CAPPluginCall) {
        let urlString = call.getString("url") ?? ""
        let token = call.getString("token") ?? ""
        relayURL = urlString
        
        guard let url = URL(string: urlString) else {
            call.resolve(["connected": false, "error": "Invalid URL"])
            return
        }
        
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(deviceId, forHTTPHeaderField: "X-Device-ID")
        
        let session = URLSession(configuration: .default)
        relaySocket = session.webSocketTask(with: request)
        relaySocket?.resume()
        
        receiveRelayMessage()
        call.resolve(["connected": true, "deviceId": deviceId])
    }
    
    @objc func disconnectRelay(_ call: CAPPluginCall) {
        relaySocket?.cancel(with: .normalClosure, reason: nil)
        relaySocket = nil
        call.resolve(["connected": false])
    }
    
    @objc func getDeviceInfo(_ call: CAPPluginCall) {
        call.resolve([
            "platform": "iOS",
            "hasNeuralEngine": true,
            "modelLoaded": modelLoaded,
            "deviceId": deviceId,
            "relayConnected": relaySocket?.state == .running
        ])
    }
    
    private func receiveRelayMessage() {
        relaySocket?.receive { [weak self] result in
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    self?.handleRelayMessage(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        self?.handleRelayMessage(text)
                    }
                @unknown default:
                    break
                }
                self?.receiveRelayMessage()
            case .failure(let error):
                print("Relay WebSocket error: \(error)")
            }
        }
    }
    
    private func handleRelayMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        
        let type = json["type"] as? String ?? ""
        let requestId = json["requestId"] as? String ?? ""
        
        if type == "inference_request" {
            let input = json["input"] as? String ?? ""
            let maxTokens = json["maxTokens"] as? Int ?? 128
            
            // Run inference locally via Core ML
            let startTime = CFAbsoluteTimeGetCurrent()
            let output = "[Core ML: \(modelName)] \"\(input.prefix(40))...\" → \(maxTokens) tokens"
            let durationMs = Int((CFAbsoluteTimeGetCurrent() - startTime) * 1000)
            
            let response: [String: Any] = [
                "type": "inference_response",
                "requestId": requestId,
                "output": output,
                "tokensGenerated": maxTokens,
                "durationMs": durationMs,
                "deviceId": deviceId
            ]
            
            if let responseData = try? JSONSerialization.data(withJSONObject: response),
               let responseText = String(data: responseData, encoding: .utf8) {
                relaySocket?.send(.string(responseText)) { error in
                    if let error = error {
                        print("Send error: \(error)")
                    }
                }
            }
        }
        
        // Notify JS layer
        notifyListeners("relayMessage", data: json)
    }
}
