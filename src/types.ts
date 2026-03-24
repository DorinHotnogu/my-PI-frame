export interface Settings {
  duration: string;
  crossfade: string;
  ken_burns_enabled: string;
  ken_burns_intensity: string;
  current_album_id: string;
  is_playing: string;
  refresh_token: string;
  shuffle_enabled: string;
  brightness: string;
}

export interface Album {
  id: number;
  name: string;
  created_at: string;
}

export interface Photo {
  id: number | string;
  album_id: number | null;
  filename: string;
  original_name: string;
  order_index: number;
}

export interface ScheduleItem {
  id: number;
  day_type: 'weekday' | 'weekend';
  start_time: string;
  end_time: string;
  enabled: number;
}
