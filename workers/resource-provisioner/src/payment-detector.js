export async function verifyPayment(requestNetwork, requestId) {
  const request = await requestNetwork.fromRequestId(requestId);
  const data = await request.getData();
  const balance = await request.getBalance();

  const paid = balance && BigInt(balance.balance) >= BigInt(data.expectedAmount);
  return {
    paid,
    state: data.state,
    balance: balance?.balance || '0',
    expectedAmount: data.expectedAmount,
    txHash: data.extensions?.[0]?.values?.txHash || null,
  };
}
