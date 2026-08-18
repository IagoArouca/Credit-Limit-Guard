namespace app.credit;

using { cuid, managed } from '@sap/cds/common';

entity Customer  {
    key ID           : String(10);
        name         : String(100)   @mandatory;
        currentLimit : Decimal(15,2) @mandatory;
        usedCredit   : Decimal(15,2) @mandatory;
}

type Status : String enum {
    Pending = 'Pending';
    Approved = 'Approved';
    Rejected = 'Rejected';
}

entity LimitChangeRequest : cuid, managed {
    customer   :  Association to Customer  @mandatory;
    requestedLimit  : Decimal(15,2) @mandatory;
    increasePercent : Decimal(5,2);
    status          : Status default 'Pending';
    justication     : String(1000);
    autoApproved    : Boolean default false;
    reviewedBy      : String(100);
    reviewedAt      : DateTime;
}