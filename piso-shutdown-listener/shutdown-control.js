const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class ShutdownController {
  constructor() {
    this.pcConfigs = {}; // Store PC configurations
  }

  // Configure a PC with its connection details
  configurePC(unitId, config) {
    this.pcConfigs[unitId] = {
      ip: config.ip || `192.168.1.${100 + unitId}`,
      method: config.method || 'local', // 'local', 'ssh', 'windows-remote', 'windows-ssh'
      username: config.username || 'admin',
      password: config.password || '',
      port: config.port || 22 // SSH port
    };
  }

  // Send graceful shutdown command
  async sendShutdown(unitId) {
    const config = this.pcConfigs[unitId];
    
    if (!config) {
      console.log(`No config for PC ${unitId}, using default local shutdown`);
      return await this.shutdownLocal(unitId);
    }

    switch (config.method) {
      case 'ssh':
        return await this.shutdownSSH(unitId, config);
      case 'windows-ssh':
        return await this.shutdownWindowsSSH(unitId, config);
      case 'windows-remote':
        return await this.shutdownWindowsRemote(unitId, config);
      case 'local':
      default:
        return await this.shutdownLocal(unitId);
    }
  }

  // Local shutdown (for testing or if PC is the same machine)
  async shutdownLocal(unitId) {
    try {
      console.log(`Sending shutdown command to PC ${unitId} (local)`);
      
      // Detect OS and use appropriate command
      const platform = process.platform;
      let command;
      
      if (platform === 'win32') {
        command = `shutdown /s /t 10 /c "Time expired. Shutting down in 10 seconds..."`;
      } else if (platform === 'darwin') {
        command = `osascript -e 'tell app "System Events" to display dialog "Time expired. PC will shutdown in 10 seconds." buttons {"OK"} default button 1 giving up after 10' && sudo shutdown -h +0`;
      } else { // Linux
        command = `shutdown -h +1 "Time expired. Shutting down in 1 minute..."`;
      }
      
      await execPromise(command);
      console.log(`Shutdown command sent to PC ${unitId}`);
      return { success: true, message: 'Shutdown initiated' };
    } catch (error) {
      console.error(`Failed to shutdown PC ${unitId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // SSH-based shutdown (for Linux/Mac PCs on network)
  async shutdownSSH(unitId, config) {
    try {
      console.log(`Sending SSH shutdown to PC ${unitId} at ${config.ip}`);
      
      const command = `ssh ${config.username}@${config.ip} "echo '${config.password}' | sudo -S shutdown -h +1 'Time expired'"`;
      await execPromise(command, { timeout: 5000 });
      
      console.log(`SSH shutdown sent to PC ${unitId}`);
      return { success: true, message: 'SSH shutdown initiated' };
    } catch (error) {
      console.error(`Failed SSH shutdown for PC ${unitId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Windows SSH shutdown (works cross-platform if Windows has OpenSSH server)
  async shutdownWindowsSSH(unitId, config) {
    try {
      console.log(`Sending SSH shutdown to Windows PC ${unitId} at ${config.ip}`);
      
      // Use sshpass or expect if password authentication is needed
      // For key-based auth, just use ssh directly
      const port = config.port || 22;
      
      // Escape and quote username and password properly
      const username = config.username.replace(/'/g, "'\\''"); // Escape single quotes
      const password = config.password ? config.password.replace(/'/g, "'\\''") : '';
      
      // Windows shutdown command via SSH - use single quotes to avoid nested quote issues
      const shutdownCmd = 'shutdown.exe /s /t 10 /f /c \\"Time expired. Shutting down in 10 seconds...\\"';
      
      // Try password authentication (requires sshpass)
      let command;
      if (password) {
        // Check if sshpass is available
        try {
          await execPromise('which sshpass');
          command = `sshpass -p '${password}' ssh -o StrictHostKeyChecking=no -p ${port} '${username}'@${config.ip} "${shutdownCmd}"`;
        } catch (e) {
          // sshpass not available, try with key-based auth or plain ssh
          console.log('sshpass not found, trying without password...');
          command = `ssh -o StrictHostKeyChecking=no -p ${port} '${username}'@${config.ip} "${shutdownCmd}"`;
        }
      } else {
        command = `ssh -o StrictHostKeyChecking=no -p ${port} '${username}'@${config.ip} "${shutdownCmd}"`;
      }
      
      await execPromise(command, { timeout: 5000 });
      
      console.log(`SSH shutdown sent to Windows PC ${unitId}`);
      return { success: true, message: 'Windows SSH shutdown initiated' };
    } catch (error) {
      console.error(`Failed SSH shutdown for Windows PC ${unitId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Windows Remote shutdown (only works from Windows host)
  async shutdownWindowsRemote(unitId, config) {
    try {
      console.log(`Sending Windows remote shutdown to PC ${unitId} at ${config.ip}`);
      
      // Check if we're on macOS/Linux trying to shutdown Windows PC
      if (process.platform !== 'win32') {
        console.error(`Cannot use Windows remote shutdown from ${process.platform}. Use 'windows-ssh' method instead.`);
        return { 
          success: false, 
          error: 'Windows remote shutdown only works from Windows. Use "windows-ssh" method for cross-platform support.' 
        };
      }
      
      // Using Windows shutdown command with remote target
      const command = `shutdown /s /m \\\\${config.ip} /t 10 /c "Time expired. Shutting down in 10 seconds..."`;
      await execPromise(command, { timeout: 5000 });
      
      console.log(`Windows remote shutdown sent to PC ${unitId}`);
      return { success: true, message: 'Remote shutdown initiated' };
    } catch (error) {
      console.error(`Failed Windows remote shutdown for PC ${unitId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Cancel pending shutdown (useful if user adds more coins during countdown)
  async cancelShutdown(unitId) {
    try {
      const platform = process.platform;
      let command;
      
      if (platform === 'win32') {
        command = 'shutdown /a';
      } else {
        command = 'sudo shutdown -c';
      }
      
      await execPromise(command);
      console.log(`Shutdown cancelled for PC ${unitId}`);
      return { success: true };
    } catch (error) {
      console.log(`Could not cancel shutdown:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = ShutdownController;
