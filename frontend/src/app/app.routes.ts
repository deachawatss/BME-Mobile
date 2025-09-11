import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { PutawayComponent } from './components/putaway/putaway.component';
import { BulkPickingComponent } from './components/bulk-picking/bulk-picking.component';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'putaway', component: PutawayComponent, canActivate: [authGuard] },
  { path: 'bulk-picking', component: BulkPickingComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '/login' }
];
