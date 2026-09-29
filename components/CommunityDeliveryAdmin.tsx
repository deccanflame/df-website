"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { firestore } from "../lib/firebase";
import { DEFAULT_DELIVERY_SETTINGS, DELIVERY_SETTINGS_PATH, validateDeliverySettings } from "../functions/community-delivery.mjs";
import { COMMUNITY_ORDER_START, COMMUNITY_ORDER_END } from "../functions/delivery.mjs";

const currentSettings = (value: unknown) => ({ ...validateDeliverySettings(value), startTime: COMMUNITY_ORDER_START, endTime: COMMUNITY_ORDER_END });

// Mounted only inside the dashboard's admin gate; rules enforce write access.
export function CommunityDeliveryAdmin() {
  const [settings, setSettings] = useState(() => currentSettings(DEFAULT_DELIVERY_SETTINGS));
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!firestore) return;
    return getDoc(doc(firestore, DELIVERY_SETTINGS_PATH)).then(snapshot => {
      const saved = snapshot.data();
      setSettings(currentSettings(saved === undefined ? DEFAULT_DELIVERY_SETTINGS : saved));
      setVersion(saved?.version || 0); setLoaded(true); setDirty(false); setName(""); setEditing(null);
    }).catch(() => setError("Could not load delivery settings. Check your connection and deployed Firestore rules, then reload."))
      .finally(() => setBusy(false));
  }, []);
  useEffect(() => { void load(); }, [load]);

  function updateCommunity(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    const communities = [...settings.communities];
    if (editing === null) communities.push(name.trim()); else communities[editing] = name.trim();
    try {
      setSettings(validateDeliverySettings({ ...settings, communities }));
      setDirty(true); setName(""); setEditing(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Check the community name."); }
  }

  function removeCommunity(index: number) {
    if (!window.confirm(`Remove ${settings.communities[index]}? This takes effect when you save delivery settings.`)) return;
    setSettings({ ...settings, communities: settings.communities.filter((_: string, i: number) => i !== index) });
    setDirty(true); setEditing(null); setName(""); setMessage("");
  }

  async function save() {
    if (!firestore || !loaded || busy) return;
    setError(""); setMessage(""); setBusy(true);
    try {
      const payload = validateDeliverySettings(settings);
      const ref = doc(firestore, DELIVERY_SETTINGS_PATH);
      await runTransaction(firestore, async transaction => {
        const current = (await transaction.get(ref)).data();
        if ((current?.version || 0) !== version) throw new Error("Another admin changed these settings. Reload saved settings before editing again.");
        transaction.set(ref, { ...payload, version: version + 1, updatedAt: serverTimestamp() });
      });
      setVersion(version + 1); setDirty(false); setMessage("Delivery settings saved. New checkouts use these communities and times.");
    } catch (cause) { setError(cause instanceof Error && !cause.message.includes("permission") ? cause.message : "Could not save delivery settings. Check admin access and deployed Firestore rules."); }
    finally { setBusy(false); }
  }

  return <section className="dashboard-panel community-admin" aria-labelledby="community-admin-title">
    <div className="panel-heading"><div><span>04</span><h2 id="community-admin-title">Community delivery</h2></div></div>
    <p>Add or edit the communities eligible for free delivery, then save your changes.</p>
    <p>Community orders are accepted daily from 2–6:30 p.m., for free delivery that evening from 7–8 p.m. Phoenix time. There is no minimum order count or spend. Paid address-based Delivery and Pickup remain separate options.</p>
    <fieldset disabled={busy || !loaded} aria-label="Community delivery settings">
      <div className="community-times">
        <label>Orders open<input type="time" value={COMMUNITY_ORDER_START} readOnly /></label>
        <label>Orders close<input type="time" value={COMMUNITY_ORDER_END} readOnly /></label>
      </div>
      <ul className="community-list">{settings.communities.map((community: string, index: number) => <li key={community}>
        <span>{community}</span><div>
          <button type="button" aria-label={`Edit ${community}`} onClick={() => { setEditing(index); setName(community); setError(""); }}>Edit</button>
          <button type="button" className="danger" aria-label={`Delete ${community}`} onClick={() => removeCommunity(index)}>Delete</button>
        </div>
      </li>)}</ul>
      {!settings.communities.length && <p>No communities. Saving an empty list disables Community Delivery; paid Delivery and Pickup are unaffected.</p>}
      <form onSubmit={updateCommunity}>
        <label>{editing === null ? "New community" : "Community name"}<input value={name} onChange={event => setName(event.target.value)} maxLength={60} required /></label>
        <div className="dashboard-actions"><button type="submit">{editing === null ? "Add community" : "Update community"}</button>{editing !== null && <button type="button" className="quiet" onClick={() => { setEditing(null); setName(""); }}>Cancel edit</button>}</div>
      </form>
      <div className="dashboard-actions community-save"><button type="button" onClick={() => void save()} disabled={!dirty || editing !== null || Boolean(name.trim())}>Save delivery settings</button>{dirty && <span>Unsaved changes</span>}</div>
    </fieldset>
    <button type="button" className="community-reload" disabled={busy} onClick={() => { if (!dirty || window.confirm("Discard unsaved delivery settings and reload?")) { setBusy(true); setError(""); setMessage(""); void load(); } }}>Reload saved settings</button>
    {busy && <p role="status">{loaded ? "Saving or loading settings…" : "Loading delivery settings…"}</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
