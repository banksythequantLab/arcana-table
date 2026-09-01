import { AgentLog } from './components/AgentLog';
import { ApprovalGate } from './components/ApprovalGate';
import { Board } from './components/Board';
import { CharacterSheet } from './components/CharacterSheet';
import { DiceTray } from './components/DiceTray';
import { DMPanel } from './components/DMPanel';
import { HeroicEffortRing } from './components/HeroicEffortRing';
import { Nat20Sparks } from './components/Nat20Sparks';
import { StoryLog } from './components/StoryLog';
import { WebMCPBadge } from './components/WebMCPBadge';
import { WebMcpTools } from './mcp/WebMcpTools';

export default function App() {
  return (
    <div className='app'>
      <WebMcpTools />
      <header className='chrome'>
        <div className='brand'>
          <h1>Arcana Table</h1>
          <div className='tagline'>The agent brings the dungeon. You bring the muscle.</div>
        </div>
        <WebMCPBadge />
      </header>
      <main className='table'>
        <section className='panel'>
          <h2>The Table</h2>
          <Board />
        </section>
        <div>
          <DMPanel />
          <div style={{ height: 12 }} />
          <CharacterSheet />
        </div>
        <div>
          <StoryLog />
          <div style={{ height: 12 }} />
          <AgentLog />
        </div>
      </main>
      <DiceTray />
      <div className='footer-hint'>Playable without an agent via the DM panel. Open in ChatGPT in-app browser or Chrome 149+ with the WebMCP flag to let a co-DM drive the tools.</div>
      <HeroicEffortRing />
      <ApprovalGate />
      <Nat20Sparks />
    </div>
  );
}
