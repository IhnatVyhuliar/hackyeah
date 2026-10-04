// Must run before anything imports @solana/web3.js (getRandomValues, Buffer).
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

(globalThis as { Buffer?: typeof Buffer }).Buffer ??= Buffer;
