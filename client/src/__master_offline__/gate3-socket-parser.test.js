import { Decoder, Encoder } from 'socket.io-parser';

test('valid event and one-attachment packets still decode', () => {
  const decoder = new Decoder(), observed = [];
  decoder.on('decoded', packet => observed.push(packet));
  const encoder = new Encoder();
  const packets = encoder.encode({ type: 2, nsp: '/', data: ['synthetic-notification', new Uint8Array([1])] });
  packets.forEach(packet => decoder.add(packet));
  expect(observed).toHaveLength(1);
  expect(observed[0].data[0]).toBe('synthetic-notification');
  expect(decoder.reconstructor).toBeNull();
  decoder.destroy();
});

test.each(['50-["synthetic-offline"]', '5-1-["synthetic-offline"]', '5999999-["synthetic-offline"]'])('malformed attachment header %s is rejected without buffering', packet => {
  const decoder = new Decoder();
  expect(() => decoder.add(packet)).toThrow();
  expect(decoder.reconstructor).toBeUndefined();
  expect(() => decoder.add(new Uint8Array([1]))).toThrow();
  decoder.destroy();
});
