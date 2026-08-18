using { app.credit as credit } from '../db/schema';

service CreditService @(path: '/odata/v4/credit') {
    entity Customers as projection on credit.Customer;

    entity LimitChangeRequests as projection on credit.LimitChangeRequest actions {
        action approve(justification : String) returns LimitChangeRequests;
        action reject(justification : String) returns LimitChangeRequests;
    };

    function getCreditOverview() returns {
        pendingCount    : Integer;
        avgIncreasePct : Decimal(5,2);
    };
}