"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { useAuth } from "../app/providers";
import { firestore } from "../lib/firebase";

type DishOption = {
  id: string;
  name: string;
  description: string;
  category: string;
  active: boolean;
};

const previewOptions: DishOption[] = [
  { id: "preview-1", name: "Mutton Marag", description: "A silky, pepper-warmed Hyderabadi broth.", category: "Slow cooked", active: true },
  { id: "preview-2", name: "Dum ka Chicken", description: "Cashew-rich masala, sealed and finished on dum.", category: "Royal classic", active: true },
  { id: "preview-3", name: "Bagara Khana", description: "Tempered rice with salan and old-city soul.", category: "Deccan comfort", active: true },
  { id: "preview-4", name: "Shahi Tukda", description: "Saffron, caramelised bread and roasted nuts.", category: "Sweet finale", active: true },
];

export function VoteWidget() {
  const { user, profile, configured, openAuth } = useAuth();
  const [pollTitle, setPollTitle] = useState("Choose our next weekend special");
  const [pollSubtitle, setPollSubtitle] = useState("One vote. Four contenders. You decide what reaches the flame next.");
  const [acceptingVotes, setAcceptingVotes] = useState(true);
  const [options, setOptions] = useState<DishOption[]>(configured ? [] : previewOptions);
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [busyOption, setBusyOption] = useState<string | null>(null);
  const [status, setStatus] = useState(configured ? "Loading the contenders…" : "Connect Firebase to activate live voting.");

  useEffect(() => {
    if (!configured || !firestore) return;
    const pollRef = doc(firestore, "specialPolls", "current");
    const optionsRef = query(collection(firestore, "specialPolls", "current", "options"), orderBy("createdAt", "asc"));

    const stopPoll = onSnapshot(pollRef, (snapshot) => {
      const data = snapshot.data();
      if (data?.title) setPollTitle(data.title);
      if (data?.subtitle) setPollSubtitle(data.subtitle);
      if (typeof data?.acceptingVotes === "boolean") setAcceptingVotes(data.acceptingVotes);
    });
    const stopOptions = onSnapshot(
      optionsRef,
      (snapshot) => {
        setOptions(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<DishOption, "id">) })).filter((item) => item.active));
        setStatus(snapshot.empty ? "The next poll is being prepared." : "Sign in to cast your vote.");
      },
      () => setStatus("The dish list could not be loaded. Check your Firebase rules."),
    );

    return () => {
      stopPoll();
      stopOptions();
    };
  }, [configured]);

  useEffect(() => {
    if (!configured || !firestore || !user) return;

    return onSnapshot(
      collection(firestore, "specialPolls", "current", "votes"),
      (snapshot) => {
        const counts: Record<string, number> = {};
        let ownVote: string | null = null;
        snapshot.docs.forEach((item) => {
          const optionId = String(item.data().optionId ?? "");
          counts[optionId] = (counts[optionId] ?? 0) + 1;
          if (item.id === user.uid) ownVote = optionId;
        });
        setVoteCounts(counts);
        setSelectedOption(ownVote);
        setStatus(ownVote ? "Your vote is in. You can change it while voting is open." : "Choose the dish you want to see next.");
      },
      () => setStatus("Live results are available after your account is authorized."),
    );
  }, [configured, user]);

  const visibleSelection = user ? selectedOption : null;
  const totalVotes = useMemo(
    () => user ? Object.values(voteCounts).reduce((sum, count) => sum + count, 0) : 0,
    [user, voteCounts],
  );
  const visibleStatus = !configured
    ? "Connect Firebase to activate live voting."
    : !user
      ? options.length ? "Sign in to cast your vote." : status
      : status;

  const vote = async (optionId: string) => {
    if (!configured || !firestore) {
      openAuth("register");
      return;
    }
    if (!user) {
      openAuth("register");
      return;
    }
    if (!acceptingVotes) {
      setStatus("Voting is currently closed.");
      return;
    }

    setBusyOption(optionId);
    try {
      await setDoc(doc(firestore, "specialPolls", "current", "votes", user.uid), {
        optionId,
        updatedAt: serverTimestamp(),
      });
      setStatus("Vote saved. The live tally has been updated.");
    } catch {
      setStatus("Your vote could not be saved. Please check your connection and try again.");
    } finally {
      setBusyOption(null);
    }
  };

  return (
    <section className="vote-section" id="vote">
      <div className="section-shell vote-heading">
        <div className="section-kicker"><span>03</span><p>The people’s special</p></div>
        <div className="vote-title-row">
          <h2>{pollTitle}</h2>
          <div>
            <p>{pollSubtitle}</p>
            <span className={`poll-state ${acceptingVotes ? "open" : "closed"}`}><i />{acceptingVotes ? "Voting open" : "Voting closed"}</span>
          </div>
        </div>
      </div>

      <div className="poll-widget section-shell">
        <div className="poll-widget-header">
          <div>
            {/* <span className="poll-avatar" aria-hidden="true">DF</span> */}
            <span>
              {/* <strong>Deccan Flame</strong> */}
               <strong>Demand your Dish !</strong>
            {/* <small>Special dish poll</small> */}
            </span>
          </div>
          <span className="poll-vote-count">{user ? `${totalVotes} ${totalVotes === 1 ? "vote" : "votes"}` : "Members only"}</span>
        </div>

        <div className="poll-options" role="group" aria-label={pollTitle}>
          {options.map((option) => {
            const count = user ? voteCounts[option.id] ?? 0 : 0;
            const percentage = totalVotes ? Math.round((count / totalVotes) * 100) : 0;
            const selected = visibleSelection === option.id;
            const isBusy = busyOption === option.id;

            return (
              <button
                className={`poll-option ${selected ? "selected" : ""}`}
                key={option.id}
                type="button"
                onClick={() => vote(option.id)}
                disabled={busyOption !== null || !acceptingVotes}
                aria-pressed={selected}
                aria-label={`${option.name}${user ? `, ${percentage} percent` : ""}`}
              >
                {user && <span className="poll-option-fill" style={{ width: `${percentage}%` }} aria-hidden="true" />}
                <span className="poll-radio" aria-hidden="true"><i /></span>
                <span className="poll-option-copy">
                  <small>{option.category}</small>
                  <strong>{option.name}</strong>
                  <em>{option.description}</em>
                </span>
                <span className="poll-option-result">
                  {isBusy ? "Saving…" : user ? `${percentage}%` : "Vote"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="poll-widget-note">
          <span>{user ? "Tap another option to change your vote" : "Sign in to choose one option"}</span>
          <span>Results update live</span>
        </div>
      </div>

      <div className="vote-footer section-shell">
        <p role="status">{visibleStatus}</p>
        <span>{user ? `${totalVotes} ${totalVotes === 1 ? "vote" : "votes"} · Signed in as ${profile?.displayName ?? "guest"}` : "Only registered guests can vote and view the live tally."}</span>
      </div>
    </section>
  );
}
