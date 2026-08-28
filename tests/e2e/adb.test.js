// node tests/e2e/adb.test.js
const { findWebviewSocket } = require('./adb');

const sample = `Num       RefCount Protocol Flags    Type St Inode Path
0000000000000000: 00000002 00000000 00010000 0001 01 21331 @chrome_devtools_remote
0000000000000000: 00000002 00000000 00010000 0001 01 22873 @webview_devtools_remote_6789
0000000000000000: 00000002 00000000 00010000 0001 01 22901 @webview_devtools_remote_7001
0000000000000000: 00000003 00000000 00000000 0001 03 22910 /dev/socket/adbd
`;

let ok = true;
const t = (name, got, want) => {
  const pass = got === want;
  ok = ok && pass;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : `  got=${got} want=${want}`}`);
};

t('finds socket by pid', findWebviewSocket(sample, 7001), 'webview_devtools_remote_7001');
t('accepts numeric-string pid', findWebviewSocket(sample, '6789'), 'webview_devtools_remote_6789');
t('null for unknown pid', findWebviewSocket(sample, 1), null);
t('first webview socket when no pid', findWebviewSocket(sample), 'webview_devtools_remote_6789');
t('ignores chrome socket', findWebviewSocket(sample.replace(/webview_devtools_remote_\d+/g, 'x')), null);
t('empty input', findWebviewSocket('', 5), null);

console.log(ok ? 'all passed' : 'FAILURES');
process.exit(ok ? 0 : 1);
