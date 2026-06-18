#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(OnnxInferencePlugin, "OnnxInference",
  CAP_PLUGIN_METHOD(loadModel, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(runInference, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(connectRelay, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(disconnectRelay, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getDeviceInfo, CAPPluginReturnPromise);
)
