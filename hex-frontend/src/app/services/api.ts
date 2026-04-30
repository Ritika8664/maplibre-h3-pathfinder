import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class Api {
  constructor(private http: HttpClient) {}

  getHexagons() {
    // return this.http.get('http://127.0.0.1:8000/api/hexagons/');
  }
}
