export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export const mockLogin = (email: string, password: string): Promise<AuthResponse> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (!email || !email.includes('@')) {
        reject(new Error('Invalid email format.'));
        return;
      }
      if (!password || password.length < 6) {
        reject(new Error('Password must be at least 6 characters.'));
        return;
      }

      // Simulate a standard valid mock login
      if (email === 'admin@wdp.com' && password === '123456') {
        resolve({
          token: 'mock_jwt_token_admin',
          user: {
            id: '1',
            email: 'admin@wdp.com',
            name: 'Alex Developer',
          },
        });
      } else {
        // Allow dynamic logins for easier testing with other emails
        resolve({
          token: `mock_jwt_token_${Date.now()}`,
          user: {
            id: String(Math.floor(Math.random() * 1000) + 10),
            email: email,
            name: email.split('@')[0].toUpperCase(),
          },
        });
      }
    }, 1200);
  });
};

export const mockRegister = (email: string, password: string, name: string): Promise<AuthResponse> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (!name || name.trim().length === 0) {
        reject(new Error('Name cannot be empty.'));
        return;
      }
      if (!email || !email.includes('@')) {
        reject(new Error('Invalid email format.'));
        return;
      }
      if (!password || password.length < 6) {
        reject(new Error('Password must be at least 6 characters.'));
        return;
      }

      resolve({
        token: `mock_jwt_token_${Date.now()}`,
        user: {
          id: String(Math.floor(Math.random() * 1000) + 100),
          email: email,
          name: name,
        },
      });
    }, 1500);
  });
};
