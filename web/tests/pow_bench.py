import hashlib, time, os, sys

challenge = os.urandom(32).hex()
bits = 25
zeros = bits // 4
extra = bits % 4
expected = 2 ** bits

start = time.time()
nonce = 0
while True:
    h = hashlib.sha256(f'{challenge}{nonce}'.encode()).hexdigest()
    if h[:zeros] == '0' * zeros and (extra == 0 or int(h[zeros], 16) < (16 >> extra)):
        elapsed = time.time() - start
        print(f'\n{bits} bits: found nonce={nonce:,} in {elapsed:.1f}s')
        print(f'hash={h}')
        break
    nonce += 1
    if nonce % 1_000_000 == 0:
        elapsed = time.time() - start
        rate = nonce / elapsed / 1_000_000
        sys.stdout.write(f'\r  {nonce/1_000_000:.0f}M hashes, {elapsed:.0f}s, {rate:.1f}M/s (expected ~{expected/1_000_000:.0f}M)  ')
        sys.stdout.flush()
