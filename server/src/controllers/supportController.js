const SupportTicket = require('../models/SupportTicket');
const emailService = require('../utils/emailService');
const { escapeHtml } = emailService;
const validText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const patientSelection = '_id fullName email __enc_fullName keyVersion';
function ticketDto(ticket) {
  const obj = ticket.toObject ? ticket.toObject() : ticket;
  const result = Object.fromEntries(['_id','subject','message','status','adminReply','repliedAt','createdAt','updatedAt'].filter(key => obj[key] !== undefined).map(key => [key,obj[key]]));
  const patient = ticket.patientId;
  if (patient && typeof patient === 'object' && patient.email) {
    patient.decryptFieldsSync?.();
    result.patientId = { _id: patient._id, fullName: patient.__enc_fullName ? 'Patient' : patient.fullName, email: patient.email };
  } else result.patientId = patient?._id || patient;
  return result;
}

exports.createTicket = async (req, res) => {
  try {
    const { subject, message } = req.body || {};
    if (!validText(subject, 200) || !validText(message, 5000)) {
      return res.status(400).json({ error: 'Subject and message are required' });
    }

    const ticket = new SupportTicket({
      patientId: req.user.id,
      subject: subject.trim(),
      message: message.trim()
    });
    await ticket.save();

    res.status(201).json({
      message: 'Support ticket created successfully',
      data: ticketDto(ticket)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create ticket' });
  }
};

exports.getPatientTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ patientId: req.user.id })
      .sort({ createdAt: -1 });
    res.json({ data: tickets.map(ticketDto) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
};

exports.getAllTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find()
      .populate('patientId', patientSelection)
      .sort({ createdAt: -1 });

    const decryptedTickets = tickets.map(ticketDto);

    res.json({ data: decryptedTickets });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch all tickets' });
  }
};

exports.replyTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body || {};

    if (!/^[a-f0-9]{24}$/i.test(String(id)) || !validText(reply, 5000)) {
      return res.status(400).json({ error: 'Reply message is required' });
    }

    const ticket = await SupportTicket.findById(id).populate('patientId', patientSelection);
    if (!ticket) {
      return res.status(404).json({ error: 'Support ticket not found' });
    }

    // Resolve the minimal patient projection before committing the reply.
    const data = ticketDto(ticket);
    ticket.adminReply = reply.trim();
    ticket.status = 'Closed';
    ticket.repliedAt = new Date();
    await ticket.save();
    const notifications = { requested: false, providerAccepted: false, deliveryConfirmed: false };

    // Send email notification to patient
    if (ticket.patientId && ticket.patientId.email) {
      const patientName = data.patientId.fullName || 'Patient';
      notifications.requested = true;
      try {
      const delivery = await emailService.sendEmail({
        to: ticket.patientId.email,
        subject: `MediSync: Support Ticket Response — ${String(ticket.subject).replace(/[\r\n]+/g, ' ')}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div style="background-color: #0D3B66; padding: 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">MediSync Help Desk</h1>
            </div>
            <div style="padding: 30px; background-color: #ffffff;">
              <p style="font-size: 16px; color: #1e293b; margin-top: 0;">Dear ${escapeHtml(patientName)},</p>
              <p style="font-size: 15px; color: #475569; line-height: 1.6;">Our Support Administrator has responded to your inquiry:</p>
              
              <div style="margin: 25px 0; padding: 20px; background-color: #f8fafc; border-left: 4px solid #0d3b66; border-radius: 8px;">
                <p style="margin: 0; font-size: 13px; color: #64748b; font-weight: bold; text-transform: uppercase;">Your Ticket Message</p>
                <p style="margin: 5px 0 15px 0; font-size: 14px; color: #1e293b; font-style: italic;">"${escapeHtml(ticket.message)}"</p>
                
                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;" />
                
                <p style="margin: 0; font-size: 13px; color: #0d3b66; font-weight: bold; text-transform: uppercase;">Admin Reply</p>
                <p style="margin: 5px 0 0 0; font-size: 14px; color: #1e293b; line-height: 1.5;">${escapeHtml(ticket.adminReply)}</p>
              </div>

              <p style="font-size: 14px; color: #475569; line-height: 1.6;">Your ticket has been marked as <strong>Closed</strong>. If you have further questions, feel free to open a new support request.</p>
            </div>
            <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="font-size: 11px; color: #94a3b8; margin: 0;">This is an automated support notification from MediSync.</p>
            </div>
          </div>
        `
      });
      notifications.providerAccepted = delivery?.providerAccepted === true;
      notifications.deliveryConfirmed = delivery?.deliveryConfirmed === true;
      } catch (_) { /* The saved reply remains available in the patient portal. */ }
    }

    res.json({
      message: 'Reply saved and ticket resolved successfully',
      data: { ...data, adminReply: ticket.adminReply, status: ticket.status, repliedAt: ticket.repliedAt, updatedAt: ticket.updatedAt },
      notifications
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reply to ticket' });
  }
};
