// Mint a B1 API key for a church using a B1 login, and write it into
// .env.local automatically. The password is read hidden from the terminal and
// the full key is never printed.
//
//   node scripts/create-b1-key.mjs
//
// Flow: login -> pick church -> create "PCO Sync" key with the sync scopes
// -> update B1_API_KEY= in .env.local -> print masked confirmation.

import fs from "fs";
import readline from "readline";

const BASE = process.env.B1_API_BASE || "https://api.churchapps.org";
const SCOPES =
  "people:read people:write attendance:read attendance:write groups:read groups:write settings:read settings:write";
const ENV_PATH = new URL("../.env.local", import.meta.url);

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const onData = (char) => {
        if (!["\n", "\r", ""].includes(char.toString())) {
          readline.moveCursor(process.stdout, -1, 0);
          process.stdout.write("*");
        }
      };
      process.stdin.on("data", onData);
      rl.question(question, (answer) => {
        process.stdin.off("data", onData);
        process.stdout.write("\n");
        rl.close();
        resolve(answer);
      });
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

const email = (await ask("B1 login email: ")).trim();
const password = await ask("B1 password (hidden): ", { hidden: true });

console.log("\nLogging in...");
const loginRes = await fetch(`${BASE}/membership/users/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!loginRes.ok) {
  console.error(`Login failed (${loginRes.status}). Check the email/password.`);
  process.exit(1);
}
const login = await loginRes.json();
const churches = (login.userChurches ?? []).filter((uc) => uc?.church?.id);
if (churches.length === 0) {
  console.error("This login has no church access.");
  process.exit(1);
}

console.log("\nChurches on this account:");
churches.forEach((uc, i) => console.log(`  ${i + 1}. ${uc.church.name} (${uc.church.id})`));
const pick = parseInt(await ask(`\nCreate the key for which church? [1-${churches.length}]: `), 10);
const chosen = churches[pick - 1];
if (!chosen) {
  console.error("Invalid selection.");
  process.exit(1);
}
const jwt = chosen.jwt || chosen.apiJwt;
if (!jwt) {
  console.error("No church JWT in the login response — cannot proceed.");
  process.exit(1);
}

console.log(`\nCreating "PCO Sync" API key for ${chosen.church.name}...`);
const keyRes = await fetch(`${BASE}/membership/apiKeys`, {
  method: "POST",
  headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
  body: JSON.stringify({ name: "PCO Sync", scopes: SCOPES }),
});
if (!keyRes.ok) {
  console.error(`Key creation failed (${keyRes.status}): ${await keyRes.text()}`);
  console.error("The login may lack admin/settings permission on this church.");
  process.exit(1);
}
const created = await keyRes.json();
const key = created.key;
if (!key) {
  console.error("No key in response:", JSON.stringify(created).slice(0, 200));
  process.exit(1);
}

// sanity: verify the key works and is scoped to the chosen church
const verify = await fetch(`${BASE}/membership/campuses`, {
  headers: { Authorization: `Bearer ${key}` },
});
console.log(`Key verified against the API: ${verify.ok ? "OK" : `HTTP ${verify.status}`}`);

// write into .env.local (never print the full key)
let envText = fs.readFileSync(ENV_PATH, "utf8");
if (/^B1_API_KEY=.*$/m.test(envText)) {
  envText = envText.replace(/^B1_API_KEY=.*$/m, `B1_API_KEY=${key}`);
} else {
  envText += `\nB1_API_KEY=${key}\n`;
}
fs.writeFileSync(ENV_PATH, envText);

console.log(`\n✅ Done. Key ${key.slice(0, 12)}… (church ${chosen.church.name}, id ${chosen.church.id})`);
console.log("   Written to .env.local as B1_API_KEY — nothing to copy.");
