"use client";

import { useState } from "react";

type SyncResult = {
  pcoId: string;
  name: string;
  b1Id?: string;
  action?: string;
  error?: string;
};

type BackfillResponse = {
  ok: boolean;
  total?: number;
  created?: number;
  updated?: number;
  failed?: number;
  results?: SyncResult[];
  error?: string;
};

export default function SyncPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BackfillResponse | null>(null);
  const [secret, setSecret] = useState("");

  async function runBackfill() {
    setLoading(true);
    setData(null);
    try {
      const res = await fetch("/api/sync/backfill", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      });
      setData(await res.json());
    } catch (e) {
      setData({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Planning Center → B1 sync</h1>
      <p style={{ color: "#555" }}>
        Mirrors every person from the Planning Center test org into the B1 test
        church. Re-running is safe — existing people are updated, not duplicated.
      </p>

      <input
        type="password"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        placeholder="Admin secret (CRON_SECRET)"
        style={{
          display: "block",
          marginBottom: 12,
          padding: "8px 12px",
          fontSize: 14,
          borderRadius: 8,
          border: "1px solid #ccc",
          width: 320,
        }}
      />
      <button
        onClick={runBackfill}
        disabled={loading || !secret}
        style={{
          padding: "10px 18px",
          fontSize: 16,
          borderRadius: 8,
          border: "none",
          background: loading ? "#999" : "#2563eb",
          color: "white",
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Syncing…" : "Run backfill"}
      </button>

      {data && (
        <section style={{ marginTop: 24 }}>
          {data.ok ? (
            <p>
              <strong>{data.total}</strong> people · {data.created} created ·{" "}
              {data.updated} updated · {data.failed} failed
            </p>
          ) : (
            <p style={{ color: "crimson" }}>Error: {data.error}</p>
          )}

          {data.results && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                  <th style={{ padding: "6px 4px" }}>Name</th>
                  <th style={{ padding: "6px 4px" }}>Action</th>
                  <th style={{ padding: "6px 4px" }}>B1 id</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((r) => (
                  <tr key={r.pcoId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "6px 4px" }}>{r.name}</td>
                    <td style={{ padding: "6px 4px", color: r.error ? "crimson" : "#16a34a" }}>
                      {r.error ? "error" : r.action}
                    </td>
                    <td style={{ padding: "6px 4px", fontFamily: "monospace" }}>
                      {r.b1Id ?? r.error ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}
