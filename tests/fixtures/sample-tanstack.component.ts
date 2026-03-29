import { Component, inject } from '@angular/core';
import { injectQuery, injectMutation, injectQueryClient } from '@tanstack/angular-query-experimental';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-tanstack',
  standalone: true,
  template: '<div>tanstack</div>',
})
export class TanStackComponent {
  private http = inject(HttpClient);
  private queryClient = injectQueryClient();

  users = injectQuery(() => ({
    queryKey: ['users'],
    queryFn: () => this.http.get('/api/users'),
  }));

  createUser = injectMutation(() => ({
    mutationFn: (data: any) => this.http.post('/api/users', data),
    onSuccess: () => this.queryClient.invalidateQueries({ queryKey: ['users'] }),
  }));

  refresh(): void {
    this.queryClient.invalidateQueries({ queryKey: ['users'] });
  }
}
