import React from 'react';
const cache={};
export const motion=new Proxy({}, {get(_,tag){if(!cache[tag])cache[tag]=React.forwardRef(({children,initial,animate,exit,transition,variants,custom,whileHover,whileTap,layout,...props},ref)=>React.createElement(tag,{...props,ref},children));return cache[tag];}});
export const AnimatePresence=({children})=><>{children}</>;
