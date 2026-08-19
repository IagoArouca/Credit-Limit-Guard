import cds from '@sap/cds';
const { SELECT, UPDATE, INSERT } = cds.ql;

export default class CreditService extends cds.ApplicationService {
    async init() {

        const { Customers, LimitChangeRequests } = this.entities;

        this.before('CREATE', LimitChangeRequests, this._handleSelfApproval.bind(this));

        this.on('getCreditOverview', this._getOverviewCredit.bind(this));
        this.on('approve', LimitChangeRequests, this._approveLimitChangeRequest.bind(this));


        return super.init();
    }

    async _handleSelfApproval(req) {
        const { Customers } = this.entities;
        const { customer_ID, requestedLimit } = req.data;

        const customer = await cds.tx(req).run(
            SELECT.one.from(Customers)
                  .where({ ID: customer_ID })
        ); 
        if(!customer) return req.error(404, 'Cliente não encontrado.');

        if(requestedLimit <= customer.currentLimit ) {
            return req.error(400, 'O novo limite solicitado deve ser maior que o limite atual.');
        }

        const diff = requestedLimit - customer.currentLimit;
        const percent = Number(((diff / customer.currentLimit) * 100).toFixed(2));
        req.data.increasePercent = percent;

        if(percent <= 20) {
            req.data.status = 'Approved';
            req.data.autoApproved = true;
            req.data.reviewedBy = 'SYSTEM_AUTO';
            req.data.reviewedAt = new Date().toISOString();

            await UPDATE(Customers).set({ currentLimit: requestedLimit }).where( { ID: customer_ID});
        }
    };

    async _approveLimitChangeRequest(req) {
        const { LimitChangeRequests, Customers } = this.entities;
        const id = req.params[0]?.ID ?? req.params[0];
        const { justification } = req.data;

        const request = await cds.tx(req).run(
            SELECT.one.from(LimitChangeRequests)
                .where({ ID: id })
        );

        if(!request) return req.error(404, 'Solicitação não encontrada.');

        if(request.status !== 'Pending') {
            return req.error(400, `Solicitação já foi ${request.status === 'Approved' ? 'aprovada' : 'rejeitada'}.`);
        }

        if(request.increasePercent > 50 && !justification?.trim()) {
            return req.error(400, 'Justificativa obrigatória para aumentos superiores a 50%.');
        }

        const reviewer = req.user?.id ?? 'manager';
        if(reviewer !== 'anonymous' && reviewer === request.createdBy) {
            return req.error(400, 'O criador da solicitação não pode aprová-la (segregação de função).');
        }

        const now = new Date().toISOString();

        await cds.tx(req).run(
            UPDATE(LimitChangeRequests)
                .set({
                    status: 'Approved',
                    justification: justification ?? request.justification,
                    reviewedBy: reviewer,
                    reviewedAt: now
                }).where({ ID: id })
        );

        await cds.tx(req).run(
            UPDATE(Customers)
                .set( { currentLimit: request.requestedLimit })
                .where({ ID: request.customer_ID })
        );

        return SELECT.one.from(LimitChangeRequests).where({ ID: id });

    };

    async _getOverviewCredit() {
        const pending = await SELECT.from(LimitChangeRequests).where({ status: 'Pending'});
        const count = pending.length;

        if(count === 0) return { pendingCount: 0, avgIncreasePct: 0 };

        const totalPct = pending.reduce((sum, item) => sum + Number(item.increasePercent || 0 ), 0);
        return {
            pendingCount: count,
            avgIncreasePct: Number((totalPct / count).toFixed(2))
        };
    };
}

