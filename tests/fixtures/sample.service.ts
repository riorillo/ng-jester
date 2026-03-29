import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class SampleService {
  private http = inject(HttpClient);

  getUsers(): Observable<any[]> {
    return this.http.get<any[]>('/api/users').pipe(
      map(users => users ?? []),
      catchError(() => of([])),
    );
  }

  getUserById(id: number): Observable<any> {
    if (id <= 0) {
      return of(null);
    }
    return this.http.get(`/api/users/${id}`);
  }

  formatName(first: string, last: string): string {
    return last ? `${last}, ${first}` : first;
  }
}
