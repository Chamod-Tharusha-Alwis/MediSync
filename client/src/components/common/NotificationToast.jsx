import React from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const NotificationToast = () => {
  return (
    <ToastContainer
      position="top-right"
      autoClose={4000}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme="dark"
      toastClassName={() => "relative flex p-4 min-h-16 rounded-xl justify-between overflow-hidden cursor-pointer bg-slate-900 border border-slate-700 shadow-2xl mb-4 text-slate-200 font-medium"}
      bodyClassName={() => "flex text-sm block p-3"}
    />
  );
};

export default NotificationToast;
