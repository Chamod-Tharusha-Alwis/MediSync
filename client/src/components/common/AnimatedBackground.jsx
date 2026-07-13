import React from 'react';
import { motion } from 'framer-motion';

const AnimatedBackground = () => {
  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden bg-[#0b1120]">
      {/* Dark overlay to ensure text contrast */}
      <div className="absolute inset-0 bg-black/40 z-[1]" />
      
      {/* Orb 1: Medical Blue */}
      <motion.div
        className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full mix-blend-screen filter blur-[100px] opacity-40"
        style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.8) 0%, rgba(14,165,233,0) 70%)' }}
        animate={{
          x: ['0%', '20%', '0%'],
          y: ['0%', '30%', '0%'],
          scale: [1, 1.2, 1],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      />

      {/* Orb 2: Soft Teal */}
      <motion.div
        className="absolute top-[20%] right-[-10%] w-[60vw] h-[60vw] rounded-full mix-blend-screen filter blur-[120px] opacity-30"
        style={{ background: 'radial-gradient(circle, rgba(20,184,166,0.8) 0%, rgba(20,184,166,0) 70%)' }}
        animate={{
          x: ['0%', '-30%', '0%'],
          y: ['0%', '10%', '0%'],
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
      />

      {/* Orb 3: Subtle Purple */}
      <motion.div
        className="absolute bottom-[-20%] left-[20%] w-[55vw] h-[55vw] rounded-full mix-blend-screen filter blur-[110px] opacity-30"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.8) 0%, rgba(139,92,246,0) 70%)' }}
        animate={{
          x: ['0%', '40%', '0%'],
          y: ['0%', '-20%', '0%'],
          scale: [1, 1.3, 1],
        }}
        transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
      />

      {/* Mesh Noise Overlay for texture */}
      <div 
        className="absolute inset-0 opacity-[0.03] z-[2] mix-blend-overlay pointer-events-none"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}
      />
    </div>
  );
};

export default AnimatedBackground;
