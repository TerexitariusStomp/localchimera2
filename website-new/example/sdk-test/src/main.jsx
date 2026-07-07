import './buffer-polyfill.js';
import { fetchWalletJwt, createMpcWalletFromJwt } from '../../../../sdk/dist/web3auth-helpers.js';

window.testSdkMpc = async ({ walletAddress, message, signature, chain, jwt, sub }) => {
  try {
    if (jwt && sub) {
      const wallet = await createMpcWalletFromJwt({
        clientId: 'BFb9PwlIn0cgDq0dNSLgw9vsIVAqZ-XiUkACB5_Rktla5N6J9oJ1UeeSOILLSaAGJPYUMChG0DwP7RAzd3ZXhZA',
        verifier: 'new-localchimera',
        verifierId: sub,
        idToken: jwt,
      });
      return { success: true, address: wallet.address };
    }
    const result = await fetchWalletJwt({ walletAddress, message, signature, chain });
    return { success: true, ...result };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
};
