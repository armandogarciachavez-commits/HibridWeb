<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ScanLog extends Model
{
    protected $fillable = ['user_id', 'scanned_at', 'status', 'reader_id'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
