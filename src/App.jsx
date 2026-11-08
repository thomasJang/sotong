import React, { useState, useEffect } from 'react';
import StudentView from './components/StudentView';
import InstructorView from './components/InstructorView';

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  const isInstructor = currentPath.startsWith('/instructor');

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {isInstructor ? (
        <InstructorView />
      ) : (
        <StudentView />
      )}
    </div>
  );
}
