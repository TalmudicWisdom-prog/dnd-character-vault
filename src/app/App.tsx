import { useEffect, useRef, useState } from "react";
import { AppShell } from "../components/AppShell";
import { UpdatePrompt } from "../components/UpdatePrompt";
import { CharacterEditorPage } from "../features/characters/CharacterEditorPage";
import { CreateCharacterWizardPage } from "../features/characters/CreateCharacterWizardPage";
import { CharacterListPage } from "../features/characters/CharacterListPage";
import { CharacterSheetPage } from "../features/characters/CharacterSheetPage";
import { PdfLibraryPage } from "../features/pdfs/PdfLibraryPage";
import { PdfViewerPage } from "../features/pdfs/PdfViewerPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { StorageDiagnosticsPage } from "../features/storage/StorageDiagnosticsPage";
import { BackupRestorePage } from "../features/tools/BackupRestorePage";
import { CharacterImportWizardPage } from "../features/import/CharacterImportWizardPage";
import { AboutLegalPage } from "../features/legal/AboutLegalPage";
import { SpellbookPage } from "../features/spells/SpellbookPage";
import { getSettings } from "../storage/database";
import type { PageId } from "./navigation";
import { flushBeforeBackgrounding, rememberRoute, rememberScroll, restoreScroll, savedRouteHash } from "./sessionRestore";
import { activateCharacter, resolveActiveCharacter } from "./activeCharacter";
import { clearPortraitRecoveryState, safeStartupRoute, shouldSuppressPortrait } from "./portraitRecovery";

type AppRoute =
  | { page: PageId; characterId?: never }
  | { page: "character"; characterId: string }
  | { page: "sheet"; characterId: string }
  | { page: "spellbook"; characterId: string }
  | { page: "pdf"; documentId: string }
  | { page: "import"; characterId?: never }
  | { page: "legal"; characterId?: never };

function routeFromHash(): AppRoute {
  const route = safeStartupRoute(window.location.hash || savedRouteHash()).replace(/^#/, "");
  if (route.startsWith("character/")) {
    return { page: "character", characterId: route.replace("character/", "") };
  }
  if (route.startsWith("sheet/")) {
    return { page: "sheet", characterId: route.replace("sheet/", "") };
  }
  if (route.startsWith("spellbook/")) {
    return { page: "spellbook", characterId: route.replace("spellbook/", "") };
  }
  if (route.startsWith("pdf/")) {
    return { page: "pdf", documentId: route.replace("pdf/", "") };
  }
  if (route === "import") return { page: "import" };
  if (route === "legal") return { page: "legal" };
  if (route === "library" || route === "storage" || route === "tools" || route === "settings") return { page: route };
  return { page: "characters" };
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(routeFromHash);
  const currentRouteHashRef = useRef(window.location.hash || "#characters");

  useEffect(() => {
    const onHashChange = () => {
      rememberScroll(currentRouteHashRef.current);
      currentRouteHashRef.current = window.location.hash || "#characters";
      const next = routeFromHash();
      setRoute(next);
      rememberRoute();
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const requestedRoute = window.location.hash || savedRouteHash();
    const safeRoute = safeStartupRoute(requestedRoute);
    if (requestedRoute && safeRoute !== requestedRoute) {
      window.location.hash = safeRoute;
      return;
    }
    if (!window.location.hash && savedRouteHash()) {
      window.location.hash = savedRouteHash();
      return;
    }
    rememberRoute();
  }, []);

  useEffect(() => {
    void resolveActiveCharacter();
  }, []);

  useEffect(() => {
    restoreScroll();
  }, [route]);

  useEffect(() => {
    const timer = window.setTimeout(clearPortraitRecoveryState, 1500);
    return () => window.clearTimeout(timer);
  }, [route]);

  useEffect(() => {
    if ((route.page !== "character" && route.page !== "sheet" && route.page !== "spellbook") || route.characterId === "new") return;
    let current = true;
    void activateCharacter(route.characterId).then(async (character) => {
      if (character || !current) return;
      const fallback = await resolveActiveCharacter(route.characterId);
      if (!current) return;
      window.location.hash = fallback ? `sheet/${fallback.id}` : "characters";
    });
    return () => { current = false; };
  }, [route]);

  useEffect(() => {
    let scrollTimer = 0;
    let touchStartY = 0;
    const onScroll = () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(rememberScroll, 150);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushBeforeBackgrounding();
    };
    const onTouchStart = (event: TouchEvent) => {
      if (window.scrollY <= 0) touchStartY = event.touches[0]?.clientY ?? 0;
    };
    const onTouchEnd = (event: TouchEvent) => {
      const endY = event.changedTouches[0]?.clientY ?? 0;
      if (touchStartY && window.scrollY <= 0 && endY - touchStartY > 90) {
        window.dispatchEvent(new CustomEvent("vault:pull-refresh"));
      }
      touchStartY = 0;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", flushBeforeBackgrounding);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(scrollTimer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", flushBeforeBackgrounding);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    void getSettings().then(({ theme }) => {
      document.documentElement.dataset.theme = theme;
    });
  }, []);

  return (
    <AppShell currentPage={route.page === "character" || route.page === "sheet" || route.page === "spellbook" ? "characters" : route.page === "pdf" ? "library" : route.page === "import" ? "tools" : route.page === "legal" ? "settings" : route.page}>
      <UpdatePrompt />
      {route.page === "characters" && <CharacterListPage />}
      {route.page === "character" && (route.characterId === "new" ? <CreateCharacterWizardPage /> : <CharacterEditorPage characterId={route.characterId} suppressPortrait={shouldSuppressPortrait(route.characterId)} />)}
      {route.page === "sheet" && <CharacterSheetPage characterId={route.characterId} suppressPortrait={shouldSuppressPortrait(route.characterId)} />}
      {route.page === "spellbook" && <SpellbookPage characterId={route.characterId} />}
      {route.page === "library" && <PdfLibraryPage />}
      {route.page === "pdf" && <PdfViewerPage documentId={route.documentId} />}
      {route.page === "storage" && <StorageDiagnosticsPage />}
      {route.page === "tools" && <BackupRestorePage />}
      {route.page === "import" && <CharacterImportWizardPage />}
      {route.page === "settings" && <SettingsPage />}
      {route.page === "legal" && <AboutLegalPage />}
    </AppShell>
  );
}
