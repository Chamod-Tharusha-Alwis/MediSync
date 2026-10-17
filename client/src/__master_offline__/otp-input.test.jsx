import React from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import OtpInput from '../components/ui/OtpInput';
test('Expired generic OTP paste cannot auto-submit',()=>{const submit=jest.fn();render(<OtpInput initialSeconds={0} onSubmit={submit}/>);fireEvent.paste(screen.getByRole('group'),{clipboardData:{getData:()=> '123456'}});expect(submit).not.toHaveBeenCalled();expect(screen.getByLabelText('OTP Digit 1')).toBeDisabled();});
test('Generic OTP accepts six digits and rejects non-digit paste',()=>{const submit=jest.fn();render(<OtpInput onSubmit={submit}/>);fireEvent.paste(screen.getByRole('group'),{clipboardData:{getData:()=> '12e345'}});expect(submit).not.toHaveBeenCalled();fireEvent.paste(screen.getByRole('group'),{clipboardData:{getData:()=> '123456'}});expect(submit).toHaveBeenCalledWith('123456');});
