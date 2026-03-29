import { Component, OnInit, OnDestroy, inject, signal, computed, effect, input, output, model } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserService } from './user.service';

@Component({
  selector: 'app-sample',
  standalone: true,
  imports: [CommonModule],
  template: '<div>{{ name() }}</div>',
})
export class SampleComponent implements OnInit, OnDestroy {
  private userService = inject(UserService);

  name = input.required<string>();
  age = input<number>(0);
  clicked = output<void>();
  value = model<string>('');

  count = signal(0);
  double = computed(() => this.count() * 2);
  logger = effect(() => console.log(this.count()));

  isLoading = false;

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    console.log('destroyed');
  }

  increment(): void {
    this.count.set(this.count() + 1);
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    const data = await this.userService.getUser();
    if (data) {
      this.count.set(1);
    } else {
      this.count.set(0);
    }
    this.isLoading = false;
  }

  getLabel(prefix: string): string {
    return prefix ? `${prefix}: ${this.count()}` : String(this.count());
  }
}
