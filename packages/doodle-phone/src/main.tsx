import { startRoomWidget } from '@matrix-widgets/widget-shared';
import { GAME_EVENT } from './model/game';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

startRoomWidget(GAME_EVENT);

createRoot(document.getElementById('root')!).render(<App />);
