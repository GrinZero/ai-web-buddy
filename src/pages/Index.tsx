import SongInputStage from '@/components/SongInputStage';
import SceneSelectStage from '@/components/SceneSelectStage';
import DemoLoopStage from '@/components/DemoLoopStage';
import ExportStage from '@/components/ExportStage';
import { useVibeStore } from '@/lib/useVibeStore';

const Index = () => {
  const store = useVibeStore();

  return (
    <div className="min-h-screen bg-background">
      {store.stage === 'input' && (
        <SongInputStage onNext={store.goToSceneSelect} />
      )}
      {store.stage === 'scene-select' && (
        <SceneSelectStage
          onStart={store.startDemoLoop}
          onBack={store.resetAll}
        />
      )}
      {store.stage === 'demo-loop' && store.currentScene && (
        <DemoLoopStage
          songs={store.songs}
          scene={store.currentScene}
          sceneIndex={store.currentSceneIndex}
          totalScenes={store.selectedScenes.length}
          usedSongs={store.usedSongs}
          onComplete={store.completeScene}
          onBackToScenes={store.goBackToSceneSelect}
          onRestart={store.resetAll}
        />
      )}
      {store.stage === 'export' && (
        <ExportStage
          results={store.sceneResults}
          onRegenerate={store.goBackToSceneSelect}
          onRestart={store.resetAll}
        />
      )}
    </div>
  );
};

export default Index;
