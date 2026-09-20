import os from 'node:os';

const originalUserInfo = os.userInfo;

// Some restricted Windows shells make Node report ENOMEM for os.userInfo().
// tsx only needs a stable name for its temporary directory.
os.userInfo = (...args) => {
  try {
    return originalUserInfo(...args);
  } catch {
    return { username: process.env.USERNAME || 'study-hub' };
  }
};

await import('tsx');
