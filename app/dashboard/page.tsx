"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  addDoc,
  collection,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useAuth } from "../providers";
import { firestore } from "../../lib/firebase";
import { deleteDocuments } from "../../lib/deleteDocuments";

type DishOption = {
  id: string;
  name: string;
  description: string;
  category: string;
  active: boolean;
};

const starterOptions = [
  ["Mutton Marag", "A silky, pepper-warmed Hyderabadi broth.", "Slow cooked"],
  ["Dum ka Chicken", "Cashew-rich masala, sealed and finished on dum.", "Royal classic"],
  ["Bagara Khana", "Tempered rice with salan and old-city soul.", "Deccan comfort"],
  ["Shahi Tukda", "Saffron, caramelised bread and roasted nuts.", "Sweet finale"],
];

export default function DashboardPage() {
  const { user, profile, loading, configured, openAuth, logout } = useAuth();
  const [options, setOptions] = useState<DishOption[]>([]);
  const [pollTitle, setPollTitle] = useState("Choose our next weekend special");
  const [pollSubtitle, setPollSubtitle] = useState("One vote. Four contenders. You decide what reaches the flame next.");
  const [acceptingVotes, setAcceptingVotes] = useState(true);
  const [voteCount, setVoteCount] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (!configured || !firestore || !isAdmin) return;
    const pollRef = doc(firestore, "specialPolls", "current");
    const optionsRef = query(collection(firestore, "specialPolls", "current", "options"), orderBy("createdAt", "asc"));
    const votesRef = collection(firestore, "specialPolls", "current", "votes");

    const reportLoadError = () => setMessage("Dashboard data could not be loaded. Check your connection and admin access.");
    const stopPoll = onSnapshot(pollRef, (snapshot) => {
      const data = snapshot.data();
      if (data?.title) setPollTitle(data.title);
      if (data?.subtitle) setPollSubtitle(data.subtitle);
      if (typeof data?.acceptingVotes === "boolean") setAcceptingVotes(data.acceptingVotes);
    }, reportLoadError);
    const stopOptions = onSnapshot(optionsRef, (snapshot) => {
      setOptions(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<DishOption, "id">) })));
    }, reportLoadError);
    const stopVotes = onSnapshot(votesRef, (snapshot) => setVoteCount(snapshot.size), reportLoadError);
    return () => {
      stopPoll();
      stopOptions();
      stopVotes();
    };
  }, [configured, isAdmin]);

  const savePoll = async () => {
    if (!firestore) return;
    if (!pollTitle.trim() || !pollSubtitle.trim()) {
      setMessage("Enter a poll title and supporting copy.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await setDoc(doc(firestore, "specialPolls", "current"), {
        title: pollTitle.trim(),
        subtitle: pollSubtitle.trim(),
        acceptingVotes,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setMessage("Poll settings saved.");
    } catch {
      setMessage("Poll settings could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const resetDishForm = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setCategory("");
    setActive(true);
  };

  const saveDish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!firestore) return;
    setBusy(true);
    setMessage("");
    const payload = {
      name: name.trim(),
      description: description.trim(),
      category: category.trim(),
      active,
      updatedAt: serverTimestamp(),
    };
    if (!payload.name || !payload.description || !payload.category) {
      setMessage("Complete the dish name, category and description.");
      setBusy(false);
      return;
    }
    try {
      if (editingId) {
        await updateDoc(doc(firestore, "specialPolls", "current", "options", editingId), payload);
        setMessage("Dish option updated.");
      } else {
        await addDoc(collection(firestore, "specialPolls", "current", "options"), { ...payload, createdAt: serverTimestamp() });
        setMessage("Dish option added.");
      }
      resetDishForm();
    } catch {
      setMessage("The dish option could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const editDish = (option: DishOption) => {
    setEditingId(option.id);
    setName(option.name);
    setDescription(option.description);
    setCategory(option.category);
    setActive(option.active);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeDish = async (option: DishOption) => {
    if (!firestore || !window.confirm(`Delete ${option.name} and its votes?`)) return;
    setBusy(true);
    try {
      // Hide first so no new votes can arrive after the query is taken.
      const optionRef = doc(firestore, "specialPolls", "current", "options", option.id);
      await updateDoc(optionRef, { active: false, updatedAt: serverTimestamp() });
      const relatedVotes = await getDocs(query(collection(firestore, "specialPolls", "current", "votes"), where("optionId", "==", option.id)));
      await deleteDocuments(firestore, relatedVotes.docs.map((vote) => vote.ref));
      await deleteDoc(optionRef);
      if (editingId === option.id) resetDishForm();
      setMessage("Dish option deleted.");
    } catch {
      setMessage("Deletion did not finish. The dish may be hidden; retry Delete to finish removing it and its votes.");
    } finally {
      setBusy(false);
    }
  };

  const resetVotes = async () => {
    if (!firestore || !window.confirm("Reset every vote in the current poll?")) return;
    setBusy(true);
    try {
      const pollRef = doc(firestore, "specialPolls", "current");
      const wasOpen = (await getDoc(pollRef)).data()?.acceptingVotes === true;
      await updateDoc(pollRef, { acceptingVotes: false, updatedAt: serverTimestamp() });
      const votes = await getDocs(collection(firestore, "specialPolls", "current", "votes"));
      await deleteDocuments(firestore, votes.docs.map((vote) => vote.ref));
      if (wasOpen) await updateDoc(pollRef, { acceptingVotes: true, updatedAt: serverTimestamp() });
      setMessage("All current votes have been reset.");
    } catch {
      setMessage("The reset did not finish. Voting may remain closed; retry the reset before reopening it.");
    } finally {
      setBusy(false);
    }
  };

  const addStarterOptions = async () => {
    if (!firestore) return;
    setBusy(true);
    try {
      const batch = writeBatch(firestore);
      starterOptions.forEach(([dishName, dishDescription, dishCategory]) => {
        const reference = doc(collection(firestore!, "specialPolls", "current", "options"));
        batch.set(reference, {
          name: dishName,
          description: dishDescription,
          category: dishCategory,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      batch.set(doc(firestore, "specialPolls", "current"), {
        title: pollTitle,
        subtitle: pollSubtitle,
        acceptingVotes: true,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await batch.commit();
      setMessage("Starter poll created.");
    } catch {
      setMessage("Starter options could not be added.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <main className="dashboard-state"><div className="dashboard-loader" /><p>Checking access…</p></main>;
  }

  if (!configured) {
    return (
      <main className="dashboard-state">
        <img src="/deccan-flame-logo.webp" alt="Deccan Flame" />
        <p>Firebase setup required</p>
        <h1>Connect Firebase before opening the dashboard.</h1>
        <span>Copy .env.example to .env.local, add the Firebase web app values, then restart the local server.</span>
        <Link href="/">Back to the website</Link>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="dashboard-state">
        <img src="/deccan-flame-logo.webp" alt="Deccan Flame" />
        <p>Admin access</p>
        <h1>Sign in to continue.</h1>
        <button type="button" onClick={() => openAuth("login")}>Open sign in</button>
        <Link href="/">Back to the website</Link>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="dashboard-state">
        <img src="/deccan-flame-logo.webp" alt="Deccan Flame" />
        <p>Restricted area</p>
        <h1>This account does not have admin rights.</h1>
        <span>Set this user’s Firestore profile role to “admin” from the Firebase console.</span>
        <Link href="/">Back to the website</Link>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header className="dashboard-nav">
        <Link href="/" className="dashboard-brand"><img src="/deccan-flame-logo.webp" alt="" /><span><strong>Deccan Flame</strong><small>Admin dashboard</small></span></Link>
        <div><span>{profile.displayName}</span><button type="button" onClick={logout}>Sign out</button></div>
      </header>

      <section className="dashboard-hero">
        <div><p>Special dish control room</p><h1>Give the table<br /><em>a voice.</em></h1></div>
        <div className="dashboard-metric"><strong>{voteCount}</strong><span>Live votes</span><i className={acceptingVotes ? "live" : ""} /></div>
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-panel poll-panel">
          <div className="panel-heading"><div><span>01</span><h2>Poll settings</h2></div><p>Control the message and voting status.</p></div>
          <label><span>Poll title</span><input value={pollTitle} onChange={(event) => setPollTitle(event.target.value)} /></label>
          <label><span>Supporting copy</span><textarea rows={3} value={pollSubtitle} onChange={(event) => setPollSubtitle(event.target.value)} /></label>
          <label className="dashboard-toggle"><input type="checkbox" checked={acceptingVotes} onChange={(event) => setAcceptingVotes(event.target.checked)} /><span><i />Accepting votes</span></label>
          <div className="dashboard-actions"><button type="button" onClick={savePoll} disabled={busy}>Save settings</button><button className="danger" type="button" onClick={resetVotes} disabled={busy || voteCount === 0}>Reset votes</button></div>
        </div>

        <div className="dashboard-panel dish-form-panel">
          <div className="panel-heading"><div><span>02</span><h2>{editingId ? "Edit dish" : "Add a contender"}</h2></div><p>Every active option appears in the vote.</p></div>
          <form onSubmit={saveDish}>
            <label><span>Dish name</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <label><span>Category</span><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="e.g. Royal classic" required /></label>
            <label><span>Description</span><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} required /></label>
            <label className="dashboard-toggle"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span><i />Visible in poll</span></label>
            <div className="dashboard-actions"><button type="submit" disabled={busy}>{editingId ? "Update dish" : "Add dish"}</button>{editingId && <button className="quiet" type="button" onClick={resetDishForm}>Cancel</button>}</div>
          </form>
        </div>
      </section>

      <section className="dashboard-panel options-panel">
        <div className="panel-heading"><div><span>03</span><h2>Dish options</h2></div><p>{options.length} configured</p></div>
        {options.length === 0 ? (
          <div className="dashboard-empty"><p>No options yet. Start with the curated sample set or add your own.</p><button type="button" onClick={addStarterOptions} disabled={busy}>Add starter options</button></div>
        ) : (
          <div className="dashboard-options">
            {options.map((option, index) => (
              <article key={option.id}>
                <span>0{index + 1}</span>
                <div><p>{option.category} · {option.active ? "Live" : "Hidden"}</p><h3>{option.name}</h3><small>{option.description}</small></div>
                <div><button type="button" disabled={busy} onClick={() => editDish(option)}>Edit</button><button className="danger" type="button" disabled={busy} onClick={() => removeDish(option)}>Delete</button></div>
              </article>
            ))}
          </div>
        )}
      </section>

      {message && <div className="dashboard-toast" role="status">{message}<button type="button" aria-label="Dismiss notification" onClick={() => setMessage("")}>×</button></div>}
    </main>
  );
}
