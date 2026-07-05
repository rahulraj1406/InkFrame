// Empty stub to bypass missing tflite_web_api_client module
// This module is a Chrome-internal extension API that doesn't exist in normal browsers.
// The actual TFLite inference uses the WASM backend, not this API.
export const tfweb = {
  tflite_web_api: null,
  TFLiteWebModelRunner: null,
};
export default {};
