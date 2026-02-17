import { Component } from '@angular/core';
import { ChronodexComponent } from './components/chronodex/chronodex.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ChronodexComponent],
  template: `
    <app-chronodex></app-chronodex>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background-color: #f8f9fa;
    }
  `]
})
export class App { }
