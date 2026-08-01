import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { Character } from "../../domain/models";
import { activateCharacter, queueCharacterAnnouncement, rankAvailableCharacters, rememberPendingSheetSection } from "../../app/activeCharacter";
import { flushPendingCharacterEdits } from "../../app/sessionRestore";
import { db } from "../../storage/database";
import { CharacterAvatar } from "./CharacterAvatar";
import { SheetNavigator } from "./SheetNavigator";
import type { CharacterMenuItem, SheetNavigatorSection } from "./sheetLayout";

type CharacterHudProps = {
  character: Character;
  items: CharacterMenuItem[];
  onSelectMenuItem: (item: CharacterMenuItem) => void;
};

export function switcherMode(characterCount: number) {
  if (characterCount <= 1) return "hidden" as const;
  if (characterCount === 2) return "direct" as const;
  return "panel" as const;
}

export function CharacterHud({ character, items, onSelectMenuItem }: CharacterHudProps) {
  const storedCharacters = useLiveQuery(() => db.characters.toArray(), []) ?? [];
  const characters = useMemo(() => rankAvailableCharacters(storedCharacters), [storedCharacters]);
  const mode = switcherMode(characters.length);
  const [openHudPanel, setOpenHudPanel] = useState<"characters" | "sections" | null>(null);
  const sheetSections = useMemo(() => items.filter((item): item is SheetNavigatorSection => item.kind === "section"), [items]);
  const [activeSection, setActiveSection] = useState(sheetSections[0]);
  const [query, setQuery] = useState("");
  const [switchingId, setSwitchingId] = useState("");
  const [isScrolling, setIsScrolling] = useState(false);
  const characterTriggerRef = useRef<HTMLButtonElement | null>(null);
  const characterCloseRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let timer = 0;
    const onScroll = () => {
      setIsScrolling(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIsScrolling(false), 180);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    setOpenHudPanel(null);
    setQuery("");
    setSwitchingId("");
  }, [character.id]);

  useEffect(() => {
    if (openHudPanel !== "characters") return;
    const frame = window.requestAnimationFrame(() => characterCloseRef.current?.focus());
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpenHudPanel(null);
      window.setTimeout(() => characterTriggerRef.current?.focus(), 0);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openHudPanel]);

  const closeCharactersAndRestoreFocus = () => {
    setOpenHudPanel(null);
    window.setTimeout(() => characterTriggerRef.current?.focus(), 0);
  };

  const visibleCharacters = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return characters;
    return characters.filter((candidate) => [candidate.name, candidate.characterClass, candidate.ancestry, candidate.campaign]
      .some((value) => value.toLocaleLowerCase().includes(normalized)));
  }, [characters, query]);

  const switchTo = async (target: Character) => {
    if (target.id === character.id || switchingId) return;
    setSwitchingId(target.id);
    setOpenHudPanel(null);
    await flushPendingCharacterEdits();
    rememberPendingSheetSection(activeSection?.targetId ?? sheetSections[0]?.targetId ?? "");
    await activateCharacter(target.id);
    queueCharacterAnnouncement(`Switched to ${target.name}.`);
    window.location.hash = `sheet/${target.id}`;
  };

  const directTarget = mode === "direct" ? characters.find((candidate) => candidate.id !== character.id) : undefined;

  return (
    <div className={`character-hud${isScrolling && !openHudPanel ? " is-scrolling" : ""}`}>
      {directTarget && (
        <button
          aria-label={`Switch to ${directTarget.name}`}
          className="character-switch-trigger direct"
          disabled={Boolean(switchingId)}
          onClick={() => void switchTo(directTarget)}
          type="button"
        >
          <CharacterAvatar name={directTarget.name} portraitDataUrl={directTarget.portraitDataUrl} size="small" />
          <span>{directTarget.name}</span>
        </button>
      )}

      {mode === "panel" && (
        <button
          aria-controls="character-switcher-panel"
          aria-expanded={openHudPanel === "characters"}
          aria-label={`Open character switcher. Current character: ${character.name}`}
          className="character-switch-trigger"
          onClick={() => setOpenHudPanel((current) => current === "characters" ? null : "characters")}
          ref={characterTriggerRef}
          type="button"
        >
          <CharacterAvatar name={character.name} portraitDataUrl={character.portraitDataUrl} size="small" />
          <span>{character.name}</span>
          <span aria-hidden="true">⌄</span>
        </button>
      )}

      <SheetNavigator
        items={items}
        onActiveSectionChange={setActiveSection}
        onOpenChange={(open) => setOpenHudPanel(open ? "sections" : null)}
        onSelect={onSelectMenuItem}
        open={openHudPanel === "sections"}
      />

      {openHudPanel === "characters" && (
        <>
          <button aria-label="Close character switcher" className="sheet-section-dismiss-layer" onClick={closeCharactersAndRestoreFocus} type="button" />
          <section aria-label="Switch character" className="character-switch-popover" id="character-switcher-panel">
            <header className="sheet-section-popover-header">
              <div><span className="card-label">Your party</span><h2>Switch Character</h2></div>
              <button aria-label="Close character switcher" className="sheet-section-close" onClick={closeCharactersAndRestoreFocus} ref={characterCloseRef} type="button">×</button>
            </header>
            {characters.length > 6 && <label className="character-switch-search"><span className="sr-only">Search active characters</span><input autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="Search characters" type="search" value={query} /></label>}
            <div className="character-switch-options">
              {visibleCharacters.map((candidate) => {
                const current = candidate.id === character.id;
                return (
                  <button aria-current={current ? "true" : undefined} className={current ? "character-switch-option active" : "character-switch-option"} disabled={current || Boolean(switchingId)} key={candidate.id} onClick={() => void switchTo(candidate)} type="button">
                    <CharacterAvatar name={candidate.name} portraitDataUrl={candidate.portraitDataUrl} size="small" />
                    <span><strong>{candidate.name}</strong><small>{candidate.characterClass ? `Level ${candidate.level} ${candidate.characterClass}` : `Level ${candidate.level}`}{candidate.campaign ? ` · ${candidate.campaign}` : ""}</small></span>
                    {candidate.favorite && <span aria-label="Favorite" className="character-favorite-marker">★</span>}
                    {current && <span className="status-badge">Active</span>}
                  </button>
                );
              })}
              {!visibleCharacters.length && <p className="empty-inline">No active characters match.</p>}
            </div>
            <a className="secondary-button compact button-link character-manage-link" href="#characters">Manage characters</a>
          </section>
        </>
      )}
    </div>
  );
}
