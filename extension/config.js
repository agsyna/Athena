// Where the Athena backend lives.
//
// The backend is the half of Athena that holds the App Certificate and signs
// RTC and RTM tokens. An extension is readable by anyone who installs it, so
// the certificate cannot live here.
//
// To point this extension at a deployed backend, change SERVER below AND add
// the same origin to `host_permissions` in manifest.json. Chrome blocks fetches
// to any host the manifest does not declare, so changing one without the other
// fails at runtime with an opaque network error.
export const SERVER = 'http://localhost:3000';
