<?php
require_once __DIR__ . '/supabase.php';

// Allowed tables (whitelist)
$allowed_tables = [
    'daily_user_profits',
    'deposits',
    'game_global_state',
    'game_rounds',
    'game_rules',
    'income_daily',
    'income_totals',
    'investments',
    'invite_codes',
    'ledger',
    'profiles',
    'referrals',
    'run_days',
    'runs',
    'wallets',
    'wheel_cycles',
    'wheel_eligibility',
    'wheel_spins',
    'withdraw_addresses',
    'withdrawals'
];

$table = isset($_GET['table']) ? $_GET['table'] : '';
if (!in_array($table, $allowed_tables)) {
    http_response_code(400);
    echo "Invalid table.";
    exit;
}

// Fetch data from Supabase
$response = supabase_select($table);
if (isset($response['error'])) {
    $error_message = $response['error'];
    $rows = [];
} else {
    $rows = $response['data'];
    $status = $response['status'];
    if ($status >= 400) {
        $error_message = 'Error fetching data (HTTP ' . $status . ')';
        $rows = [];
    } else {
        $error_message = null;
    }
}

// Determine columns
$columns = [];
if (!empty($rows)) {
    // Use keys from the first row
    $columns = array_keys($rows[0]);
}

// Determine id column (for edit/delete links)
$id_column = null;
if (in_array('id', $columns)) {
    $id_column = 'id';
} elseif (!empty($columns)) {
    $id_column = $columns[0];
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= htmlspecialchars($table) ?> - Records</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QLQ8nxxcC2RDIgoDhZp5PbheEplVe0pBI6U++0nF5J6emCq//BcgCBXIZJx/V6aI" crossorigin="anonymous">
</head>
<body>
<div class="container-fluid py-4">
    <div class="d-flex justify-content-between align-items-center mb-3">
        <h2><?= htmlspecialchars($table) ?></h2>
        <div>
            <a href="index.php" class="btn btn-secondary me-2">← Back to Tables</a>
            <a href="form.php?table=<?= urlencode($table) ?>" class="btn btn-primary">+ New Record</a>
        </div>
    </div>
    <?php if ($error_message): ?>
        <div class="alert alert-danger" role="alert">
            <?= htmlspecialchars($error_message) ?>
        </div>
    <?php endif; ?>
    <div class="table-responsive">
        <table class="table table-bordered table-hover table-sm align-middle">
            <thead class="table-light">
            <tr>
                <?php foreach ($columns as $col): ?>
                    <th><?= htmlspecialchars($col) ?></th>
                <?php endforeach; ?>
                <th>Actions</th>
            </tr>
            </thead>
            <tbody>
            <?php foreach ($rows as $row): ?>
                <tr>
                    <?php foreach ($columns as $col): ?>
                        <?php $value = $row[$col]; ?>
                        <td>
                            <?php
                            if (is_array($value)) {
                                echo htmlspecialchars(json_encode($value));
                            } elseif ($value === null) {
                                echo '<em>null</em>';
                            } else {
                                $str = strval($value);
                                echo htmlspecialchars(strlen($str) > 80 ? substr($str, 0, 77) . '...' : $str);
                            }
                            ?>
                        </td>
                    <?php endforeach; ?>
                    <td class="text-nowrap">
                        <a href="form.php?table=<?= urlencode($table) ?>&id=<?= urlencode($row[$id_column]) ?>" class="btn btn-sm btn-outline-primary">Edit</a>
                        <a href="delete.php?table=<?= urlencode($table) ?>&id=<?= urlencode($row[$id_column]) ?>" class="btn btn-sm btn-outline-danger" onclick="return confirm('Delete this record?');">Delete</a>
                    </td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js" integrity="sha384-J07/uxz7Xoa3Q7ZPUnWi+wS2YXKRcLp/rscbQ/eKUR/v0MHDIt0tWoFxKk5PP9mg" crossorigin="anonymous"></script>
</body>
</html>
