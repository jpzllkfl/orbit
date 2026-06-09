import { lazy, Suspense } from 'react';
import type { OrbitNode } from '../types/orbit';
import type { WizardResult } from './ConnectWizard';
import ORBIT_DATA from '../lib/data.js';

type TitleResult = { type: string; title: string; year?: number | null; genre?: string; poster?: string | null; tmdbId?: number };
type CollResult = { tmdbId: number; title: string; poster?: string | null; overview?: string };

const AddModal = lazy(() => import('./AddModal').then((m) => ({ default: m.AddModal })));
const AddToCollectionModal = lazy(() => import('./AddToCollectionModal').then((m) => ({ default: m.AddToCollectionModal })));
const ArtEditor = lazy(() => import('./ArtEditor').then((m) => ({ default: m.ArtEditor })));
const BackdropPicker = lazy(() => import('./BackdropPicker').then((m) => ({ default: m.BackdropPicker })));
const ConnectWizard = lazy(() => import('./ConnectWizard').then((m) => ({ default: m.ConnectWizard })));
const MergeCollectionsModal = lazy(() => import('./MergeCollectionsModal').then((m) => ({ default: m.MergeCollectionsModal })));

type ModalHostProps = {
  tree: OrbitNode;
  archive: OrbitNode[];
  connected: boolean;
  addToCollFor: OrbitNode | null;
  mergeOpen: boolean;
  mergeSource: OrbitNode | null;
  mergeDest: OrbitNode | null;
  modalFor: { coll: OrbitNode; kind?: 'movie' | 'show' | 'collection' } | null;
  showWizard: boolean;
  artFor: OrbitNode | null;
  artFocus: 'both' | 'backdrop' | 'poster';
  bgPickerFor: OrbitNode | null;
  onCloseAddToColl: () => void;
  onAddToColl: (targetId: string) => void;
  onCloseMerge: () => void;
  onMerge: (sourceId: string, destId: string) => void;
  onCloseModal: () => void;
  onOpenConnect: () => void;
  onCreate: (node: OrbitNode) => void;
  onAddTitle: (r: TitleResult) => void;
  onAddFranchise: (cr: CollResult) => Promise<number>;
  onAddArchive: (node: OrbitNode) => void;
  onCloseWizard: () => void;
  onWizardComplete: (r: WizardResult) => void;
  onCloseArt: () => void;
  onArtSaved: () => void;
  onCloseBackdrop: () => void;
  onBackdropSaved: () => void;
};

export function ModalHost(props: ModalHostProps) {
  const {
    tree,
    archive,
    connected,
    addToCollFor,
    mergeOpen,
    mergeSource,
    mergeDest,
    modalFor,
    showWizard,
    artFor,
    artFocus,
    bgPickerFor,
    onCloseAddToColl,
    onAddToColl,
    onCloseMerge,
    onMerge,
    onCloseModal,
    onOpenConnect,
    onCreate,
    onAddTitle,
    onAddFranchise,
    onAddArchive,
    onCloseWizard,
    onWizardComplete,
    onCloseArt,
    onArtSaved,
    onCloseBackdrop,
    onBackdropSaved,
  } = props;

  const open =
    addToCollFor || mergeOpen || modalFor || showWizard || artFor || bgPickerFor;
  if (!open) return null;

  return (
    <Suspense fallback={null}>
      {addToCollFor && (
        <AddToCollectionModal
          tree={tree}
          title={addToCollFor}
          onClose={onCloseAddToColl}
          onAdd={onAddToColl}
        />
      )}
      {mergeOpen && (
        <MergeCollectionsModal
          tree={tree}
          source={mergeSource}
          dest={mergeDest}
          onClose={onCloseMerge}
          onMerge={onMerge}
        />
      )}
      {modalFor && (
        <AddModal
          collection={modalFor.coll}
          present={modalFor.coll.children || []}
          archive={archive}
          connected={connected}
          defaultKind={modalFor.kind || 'movie'}
          onOpenConnect={onOpenConnect}
          onClose={onCloseModal}
          onCreate={onCreate}
          onAddTitle={onAddTitle}
          onAddFranchise={onAddFranchise}
          onAddArchive={onAddArchive}
        />
      )}
      {showWizard && (
        <ConnectWizard
          demoTree={structuredClone(ORBIT_DATA.ROOT)}
          onClose={onCloseWizard}
          onComplete={onWizardComplete}
        />
      )}
      {artFor && <ArtEditor node={artFor} focus={artFocus} onClose={onCloseArt} onSaved={onArtSaved} />}
      {bgPickerFor && (
        <BackdropPicker node={bgPickerFor} onClose={onCloseBackdrop} onSaved={onBackdropSaved} />
      )}
    </Suspense>
  );
}
