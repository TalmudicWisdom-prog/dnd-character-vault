import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { CharacterEditorPage } from "../features/characters/CharacterEditorPage";
import { CharacterListPage } from "../features/characters/CharacterListPage";
import { CharacterSheetPage } from "../features/characters/CharacterSheetPage";
import { PdfLibraryPage } from "../features/pdfs/PdfLibraryPage";
import { PdfViewerPage } from "../features/pdfs/PdfViewerPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { StorageDiagnosticsPage } from "../features/storage/StorageDiagnosticsPage";
import { BackupRestorePage } from "../features/tools/BackupRestorePage";
import { CharacterImportWizardPage } from "../features/import/CharacterImportWizardPage";
import { SpellbookPage } from "../features/spells/SpellbookPage";
import { getSettings } from "../storage/database";
import type { PageId } from "./navigation";

type AppRoute =
  | { page: PageId; characterId?: never }
  | { page: "character"; characterId: string }
  | { page: "sheet"; characterId: string }
  | { page: "spellbook"; characterId: string }
  | { page: "pdf"; documentId: string }
  | { page: "import"; characterId?: never };

function routeFromHash(): AppRoute {
  const route = window.location.hash.slice(1);
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
  if (route === "library" || route === "storage" || route === "tools" || route === "settings") return { page: route };
  return { page: "characters" };
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(routeFromHash);

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    void getSettings().then(({ theme }) => {
      document.documentElement.dataset.theme = theme;
    });
  }, []);

  return (
    <AppShell currentPage={route.page === "character" || route.page === "sheet" || route.page === "spellbook" ? "characters" : route.page === "pdf" ? "library" : route.page === "import" ? "tools" : route.page}>
      {route.page === "characters" && <CharacterListPage />}
      {route.page === "character" && <CharacterEditorPage characterId={route.characterId} />}
      {route.page === "sheet" && <CharacterSheetPage characterId={route.characterId} />}
      {route.page === "spellbook" && <SpellbookPage characterId={route.characterId} />}
      {route.page === "library" && <PdfLibraryPage />}
      {route.page === "pdf" && <PdfViewerPage documentId={route.documentId} />}
      {route.page === "storage" && <StorageDiagnosticsPage />}
      {route.page === "tools" && <BackupRestorePage />}
      {route.page === "import" && <CharacterImportWizardPage />}
      {route.page === "settings" && <SettingsPage />}
    </AppShell>
  );
}
