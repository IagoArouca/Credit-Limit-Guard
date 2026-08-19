import cds from '@sap/cds';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { SELECT, DELETE, INSERT } = cds.ql;
const { expect, beforeEach } = global;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


describe('Credit Service - Suíte de Testes', () => {
    const testEnv = cds.test(__dirname + '/..');

    beforeEach(async () => {
        const { Customers, LimitChangeRequests } = cds.entities('CreditService');

        await cds.run(DELETE.from(LimitChangeRequests));
        await cds.run(DELETE.from(Customers));

        await cds.run(
            INSERT.into(Customers).entries({
                ID: 'CUST-1001',
                name: 'Empresa Alpha Ltda',
                currentLimit: 50000.00,
                usedCredit: 12000.00
            })
        );

        await cds.run(
            INSERT.into(Customers).entries({
                ID: 'CUST-1003',
                name: 'Comércio de Bebidas Silva',
                currentLimit: 25000.00,
                usedCredit: 22000.00
            })
        );

        await cds.run(
            INSERT.into(Customers).entries({
                ID: 'CUST-1002',
                name: 'Tech Solutions S/A',
                usedCredit: 25000.00
            })
        );
    })

    test('Deve auto-aprovar solicitação com aumento de até 20%', async () => {
        const { Customers } = cds.entities('CreditService')
        

        const res = await testEnv.POST('/odata/v4/credit/LimitChangeRequests', {
            customer_ID: 'CUST-1001',
            requestedLimit: 55000.00
        });

        expect(res.status).toBe(201);
        expect(res.data.status).toBe('Approved');
        expect(res.data.autoApproved).toBe(true);
        expect(res.data.increasePercent).toBe('10.00');

        const customer = await cds.run(
            SELECT.one
                .from(Customers)
                .where({ ID: 'CUST-1001'})
        );
        expect(Number(customer.currentLimit)).toBe(55000.00);
    });

    test('Deve recusar aprovação manual de aumento > 50% sem justificativa', async () => {
        const { LimitChangeRequests } = cds.entities('CreditService');

        const createRes = await testEnv.POST('/odata/v4/credit/LimitChangeRequests', {
            customer_ID: 'CUST-1003',
            requestedLimit: 45000.00
        });

        expect(createRes.status).toBe(201);
        expect(createRes.data.status).toBe('Pending');

        const requestId = createRes.data.ID;

        try {
            await testEnv.POST(`/odata/v4/credit/LimitChangeRequests('${requestId}')/CreditService.approve`, {
                justification: ''
            });
        } catch (err) {
            expect(err.response.status).toBe(400);
            expect(err.response.data.error.message).toContain(
                'Justificativa obrigatória para aumentos superiores a 50%'
            );
        }

    });

    test('Deve impedir que o criador aprove a própria solicitação', async () => {

        const createRes = await testEnv.POST(
            '/odata/v4/credit/LimitChangeRequests',
            {
                customer_ID: 'CUST-1002',
                requestedLimit: 140000.00
            },
            {
                headers: { authorization: 'Basic YW5hbGlzdGExOmR1bW15' }
            }
        );

        const requestId = createRes.data.ID;

        try {
            await testEnv.POST(
                `/odata/v4/credit/LimitChangeRequests('${requestId}')/CreditService.approve`,
                { justification: 'Aumento justificado para expansão' },
                {
                    headers: { authorization: 'Basic YW5hbGlzdGExOmR1bW15' }
                }
            );
        } catch (err) {
            expect(err.response.status).toBe(400);
            expect(err.response.data.error.message).toContain(
                'O criador da solicitação não pode aprová-la'
            );
        }
    });
});