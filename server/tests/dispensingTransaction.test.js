jest.mock('uuid', () => ({v4:()=>require('crypto').randomUUID()}));
const {runTransaction} = require('../src/services/dispensingService');
const error = label => Object.assign(new Error(label), {errorLabels:[label]});
function fakeSession() {
  return {startTransaction:jest.fn(),commitTransaction:jest.fn().mockResolvedValue(),
    abortTransaction:jest.fn().mockResolvedValue(),endSession:jest.fn().mockResolvedValue(),inTransaction:()=>true};
}
test('session failure never runs dispensing callback', async()=>{
  const work=jest.fn(); await expect(runTransaction(work,async()=>{throw new Error('offline');})).rejects.toMatchObject({code:'TRANSACTION_UNAVAILABLE'});
  expect(work).not.toHaveBeenCalled();
});
test('transient transaction retries are bounded and abort each unsuccessful attempt',async()=>{
  const s=fakeSession(), work=jest.fn().mockRejectedValue(error('TransientTransactionError'));
  await expect(runTransaction(work,async()=>s)).rejects.toMatchObject({code:'TRANSACTION_FAILED'});
  expect(work).toHaveBeenCalledTimes(3);expect(s.abortTransaction).toHaveBeenCalledTimes(3);
});
test('unknown commit retries only the commit, never the transaction callback',async()=>{
  const s=fakeSession(),work=jest.fn().mockResolvedValue('receipt');
  s.commitTransaction.mockRejectedValueOnce(error('UnknownTransactionCommitResult')).mockResolvedValueOnce();
  expect(await runTransaction(work,async()=>s)).toBe('receipt');
  expect(work).toHaveBeenCalledTimes(1);expect(s.commitTransaction).toHaveBeenCalledTimes(2);
});
test('persistent commit uncertainty never returns success or retries the body',async()=>{
  const s=fakeSession(),work=jest.fn().mockResolvedValue('receipt');
  s.commitTransaction.mockRejectedValue(error('UnknownTransactionCommitResult'));
  await expect(runTransaction(work,async()=>s)).rejects.toMatchObject({code:'TRANSACTION_OUTCOME_UNKNOWN',status:503});
  expect(work).toHaveBeenCalledTimes(1);expect(s.commitTransaction).toHaveBeenCalledTimes(3);expect(s.abortTransaction).not.toHaveBeenCalled();
});
test('transient-labelled error after an unknown commit does not rerun the body',async()=>{
  const s=fakeSession(),work=jest.fn().mockResolvedValue('receipt');
  s.commitTransaction.mockRejectedValueOnce(error('UnknownTransactionCommitResult')).mockRejectedValueOnce(error('TransientTransactionError'));
  await expect(runTransaction(work,async()=>s)).rejects.toMatchObject({code:'TRANSACTION_OUTCOME_UNKNOWN'});
  expect(work).toHaveBeenCalledTimes(1);
});
