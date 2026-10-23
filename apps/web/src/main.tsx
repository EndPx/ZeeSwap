import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/manrope';
import '@fontsource/instrument-serif/latin-400-italic.css';
import App from './App.tsx';
import './styles.css';

if(import.meta.env.DEV&&import.meta.env.VITE_DISABLE_REACT_DEVTOOLS!=='1'){
  void import('react-grab');
  void import('react-scan').then(({scan})=>scan({enabled:true,showToolbar:false}));
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
