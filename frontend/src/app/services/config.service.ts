import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export interface AppConfig {
  apiUrl: string;
  production: boolean;
  frontendHost: string;
  frontendPort: number;
  enableDebug: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  private config: AppConfig;

  constructor() {
    // Load configuration from environment (which gets values from .env)
    this.config = {
      apiUrl: environment.apiUrl,
      production: environment.production,
      frontendHost: environment.frontendHost,
      frontendPort: environment.frontendPort,
      enableDebug: environment.enableDebug
    };

    if (this.config.enableDebug) {
      console.log('App Configuration:', this.config);
    }
  }

  getConfig(): AppConfig {
    return this.config;
  }

  getApiUrl(): string {
    return this.config.apiUrl;
  }

  isProduction(): boolean {
    return this.config.production;
  }
}