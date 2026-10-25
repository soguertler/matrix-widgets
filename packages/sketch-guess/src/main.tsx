import { startRoomWidget, MatrixCapabilities } from '@matrix-widgets/widget-shared';
import { EVENT_TYPE } from './model/game';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

startRoomWidget(EVENT_TYPE, [MatrixCapabilities.MSC4515RtcTransports]);

createRoot(document.getElementById('root')!).render(<App />);
