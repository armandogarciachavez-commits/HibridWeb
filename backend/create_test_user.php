<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;
use Illuminate\Support\Facades\Hash;

$u = User::firstOrCreate(
    ['email' => 'test@example.com'],
    [
        'name' => 'Armando García',
        'password' => Hash::make('123456'),
        'role' => 'socio'
    ]
);

$u->password = Hash::make('123456');
$u->save();

echo "Usuario test@example.com creado/actualizado exitosamente con password '123456'\n";
